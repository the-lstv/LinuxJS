(global => {
    let JSZip;

    if(typeof require === "function"){
        try {
            JSZip = require('jszip');
        } catch (e) {
            JSZip = null;
        }
    }

    async function LinuxJS(options = {}){
        if(!JSZip && !global.JSZip && !options.JSZip){
            throw "JSZip is required for LinuxJS to run. Either expose it globally as 'JSZip' or provide it via options."
        } else if(!JSZip) JSZip = global.JSZip || options.JSZip;


        if(!options.image) throw "You must specify a virtual system image/copy!";


        // Create a virtual filesystem;
        let os, fs = LinuxJS.initRootFileSystem();

        // Add JSZipFS to available filesystems
        fs.register_filesystem("JSZipFS", JSZipFS);

        let root_disk = options.disk || new JSZip;

        fs.mount("/", "JSZipFS", root_disk)
    
        if(!!options.disk? !!options.image: true){
            // Allows patches with multiple images/packages
            if(!Array.isArray(options.image)) options.image = [options.image];
    
            if(options.image.length < 1){
                throw "You must include at least one system image/patch!"
            }
    
            // Patch the virtual disk with data the images
            for(let image of options.image){
                root_disk = await JSZipFS.patch(root_disk, image)
            }
        }

        let lastPID = 1, _bootComplete = false;

        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

        // Init the "os" object;

        let encoder = new TextEncoder;
        let decoder = new TextDecoder;

        os = {
            get _bootComplete() {
                return _bootComplete
            },

            // Default global environmnet variables
            env: {
                PATH: "/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin",

                HOSTNAME: (global.location && location.hostname) || (global.process && global.process.env.HOSTNAME) || "localhost",
                LANG: global.navigator? navigator.language + ".UTF-8": global.process? global.process.env.LANG: "en_US.UTF-8",

                // FIXME: Update (move) later when managing user accounts
                HOME: "/root",
                USER: "root",
                LOGNAME: "root",

                _: "/usr/bin/env",

                ...options.env? options.env: {}
            },

            fs,

            boot(){
                if(_bootComplete) throw "Can only boot once";

                return new Promise((resolve, reject) => {

                    fs.register_filesystem("proc", class {
                        list(){

                        }
                    })

                    // Location, filesystem, device
                    fs.mount("/proc", "proc", "proc")

                    // Temporary
                    resolve()

                })
            },

            reboot(){
                // Currently unsupported
                throw 0
            },

            shutdown(){
                // Currently unsupported
                throw 0
            },
    
            get lastPID(){
                // "readonly"
                return lastPID
            },
    
            proc: {},

            shared: {},

            async process(executable, pwd, args = [], options = {}) {
                let prepared = false, _this;

                let processRunnerInstance = new class Process {
                    constructor(){
                        _this = this;

                        _this.deafultOptions = options;
                    }

                    getWorker(env = {}){
                        if(!prepared) throw "Process was not prepared yet!";

                        let worker = new Worker(_this.workerSource)

                        // Initialize worker
                        env.type = "init";
                        worker.postMessage(env)

                        return worker
                    }

                    async _init_(){

                        /*
                            This function just prepares the procces for launch.
                        */

                        if(prepared) throw "Cannot call ._init_() twice!";


                        // First, we need to find the executable

                        executable = "/" + os.fs.normalizePath(await os.fs.search(os.env.PATH, executable));

                        let executable_path = "/" + executable.split("/").filter(garbage => garbage).slice(0, -1).join("/") + "/";
            
                        let object = await os.fs.getObject(executable, pwd);
                        let descriptor = object.fileSystem.getDescriptor(object.relativePath);

                        // Initialize input output

                        if(!descriptor || descriptor.dir) {
                            return 2
                        }

                        if(!pwd) pwd = executable_path;

                        
                        _this.fileDescriptor = descriptor
                        _this.fileLocation = executable
                        _this.fileDirectory = executable_path

                        _this.defaultPwd = "/" + os.fs.normalizePath(pwd + "/");
                        _this.defaultArgs = args

                        _this.source_data = await os.fs.read(_this.fileLocation, "arraybuffer");

                        if(decoder.decode(_this.source_data.slice(0, 2)) === "#!") {
                            // The executable is a script starting with a "shebang".

                            _this.source_data = decoder.decode(_this.source_data)

                            let match = _this.source_data.match(/^#!(.*)\n/);

                            if(match && match[1]){
                                _this.interpreter = match[1].trim();

                                _this.source_data = _this.source_data.slice(match[0].length);

                                switch(_this.interpreter){
                                    // Some hard-coded interpreters
                                    // FIXME: Fix this
            
                                    case "/bin/js": case "/usr/bin/js": case "/usr/bin/node": case "/bin/node": case "/usr/bin/env node":
                                        
                                    default:
                                        // TODO: Implement interpreters properly!
                                        break;
                                }

                            } else {
                                // TODO: Better error handling
                                throw "bad interpreter: No such file or directory"
                            }
                        }

                        _this.workerSource = LinuxJS.createProccessSource(_this.source_data);

                        prepared = true;
                    }

                    run(pwd, args, options){
                        if(!prepared) throw "Process was not prepared yet!";

                        options = options? {..._this.deafultOptions, ...options}: _this.deafultOptions;

                        let worker, started = false, pid = lastPID++;

                        let instance = {
                            pid,

                            alive: true,
                            
                            terminate(){
                                instance.signal(15)
                            },

                            kill(){
                                // Normally a signal 9 would be sent, but we are just directly terminating the program anyway, so this step was skipped.

                                worker.terminate()
                                instance.invoke("exit", 137)
                                instance.alive = false
                            },
                            
                            signal(value){
                                worker.postMessage({
                                    type: 'signal',
                                    value
                                });
                            },

                            write(data){
                                worker.postMessage({
                                    type: 'stdin',
                                    data
                                });
                            },

                            resume(){
                                // Not to be confused with pausing/resuming the process state, this only resumes the execution if the pause option is set to true for delayed start.
                                if(!started) execute()
                            },

                            childProcesses: []
                        }

                        LinuxJS.signalHandler(instance, options);

                        function execute(){
                            started = true;

                            instance.promise = new Promise((resolve, reject) => {
                                worker = _this.getWorker({
                                    args: args || _this.defaultArgs || [],
                                    pwd: pwd || _this.defaultPwd || _this.fileDirectory,
                                    env: {...os.env, ...options.env || {}},
                                })
    
                                worker.onmessage = async function(event) {
                                    // Signal received from host
    
                                    let signal = event.data;
    
                                    if(!signal || !signal.type) return;
    
                                    switch(signal.type){
                                        case "stdout":
                                            instance.invoke("stdout", signal.data)
                                        break
    
                                        case "stderr":
                                            instance.invoke("stderr", signal.data)
                                        break
    
                                        case "exit": case "terminate": case "kill":
                                            worker.terminate()
                                            instance.invoke("exit", signal.code || 0)
                                            instance.alive = false
                                        break
    
                                        case "stream_pipe_in":
                                            if(os.proc[signal.pid]) os.proc[signal.pid].write(signal.data)
                                        break
    
                                        case "stream_pipe_signal":
                                            if(os.proc[signal.pid]) {                                                
                                                if(signal.value === 9) return os.proc[signal.pid].kill();

                                                os.proc[signal.pid].signal(signal.value)
                                            }
                                        break
    
                                        case "syscall":
                                            switch(signal.to){
                                                case "exec":
                                                    // Spawn a child process
    
                                                    let childRunner;

                                                    try{
                                                        childRunner = await os.process(signal.args[0], signal.args[1], signal.args[2]);
                                                    } catch (error) {
                                                        worker.postMessage({
                                                            type: "callback",
                                                            callback: signal.callback,
                                                            data: {error}
                                                        })
                                                        return
                                                    }
    
                                                    // "pipe" events to the parent
                                                    let child = childRunner.run(null, null, {    
                                                        onstdout(data){
                                                            worker.postMessage({
                                                                type: "stream_pipe_out",
                                                                pid: child.pid,
                                                                data
                                                            })
                                                        },
    
                                                        onstderr(data){
                                                            worker.postMessage({
                                                                type: "stream_pipe_err",
                                                                pid: child.pid,
                                                                data
                                                            })
                                                        },
                                                
                                                        onexit(code){
                                                            worker.postMessage({
                                                                type: "stream_pipe_exit",
                                                                pid: child.pid,
                                                                code
                                                            })
                                                        },
    
                                                        env: signal.env || {},
    
                                                        pause: true
                                                    })
    
                                                    worker.postMessage({
                                                        type: "callback",
                                                        callback: signal.callback,
                                                        data: child.pid
                                                    })
    
                                                    child.resume()
    
                                                    instance.childProcesses.push(child)
                                                break

                                                case "fs":
                                                    // Filesystem operation ("high-level way", not following the actual GNU/Linux way)

                                                    if(os.fs[signal.args[0]] && typeof os.fs[signal.args[0]] === "function"){
                                                        let result, error;

                                                        try{
                                                            result = await os.fs[signal.args[0]](...signal.args[1])
                                                        } catch (errorMessage) { error = errorMessage.toString() }

                                                        worker.postMessage({
                                                            type: "callback",
                                                            callback: signal.callback,
                                                            data: {result, error}
                                                        })
                                                    }
                                                break

                                                case "export":
                                                    // Filesystem operation ("high-level way", not following the actual GNU/Linux way)

                                                    for(let env of signal.args){
                                                        env = env.split("=");
                                                        os.env[env[0]] = env[1]
                                                    }

                                                    worker.postMessage({
                                                        type: "callback",
                                                        callback: signal.callback
                                                    })
                                                break
                                            }
                                        break
                                    }
                                }
    
                                worker.onerror = function(event) {
                                    instance.invoke("stderr", event.toString())
                                }
                            })
                        }

                        if(!options.pause) execute()

                        return os.proc[pid] = instance;
                    }
                }

                let errorCode = await processRunnerInstance._init_()

                if(errorCode) throw errorCode;

                return processRunnerInstance
            }
        }

        return os;
    }


    // VFS to handle a JSZip as a filesystem
    class JSZipFS {
        constructor(device){
            this.resolveSymlinks = true;
            this.directWrites = true;

            this.storage = device;
        }

        getDescriptor(path){
            if(!this.storage.files[path]){
                // Try flipping the trailing "/"
                path = path.endsWith("/")? path.slice(0, -1) : path + "/";
            }

            return this.storage.files[path];
        }

        async read(descriptor){
            return await descriptor.async("arraybuffer")
        }

        write(path, buffer, permissions){
            // TODO: many things
            return this.storage.file(path, buffer).files[path]
        }

        createFile(path){
            return this.storage.file(path, "").files[path]
        }

        remove(path){
            return this.storage.remove(path)
        }

        mkdir(path){
            this.storage.file(path, "")
        }

        list(path, listDir = true, recursive = false, hidden = true){
            path = LinuxJS.normalizePath(path);

            let pathLength = path.split("/").length;

            return Object.keys(this.storage.files).filter(found_path => {
                found_path = LinuxJS.normalizePath(found_path);

                // Do not include itself
                if(found_path === path) return false;

                // Do not include hidden files
                if(!hidden && (found_path.startsWith(".") || found_path.split("/").at(-1).startsWith("."))) return false;


                // Skip paths that are not a part of the parth being searched
                if(!found_path.startsWith(path)) return false;

                // Get depth and statistics
                let stat = this.getDescriptor(found_path),
                    depth = (found_path.split("/").length - 1) - pathLength
                ;

                return (listDir? true : !stat.dir) && (recursive? true : depth == 0 )
            })
        }

        stat(){
            // Currently, the getDescriptor acts as stat, which is obviously incorrect, this will be fixed later.
        }

        // Non-standard method
        async export(type = "uint8array"){
            return await this.storage.generateAsync({
                type,
                platform: "UNIX"
            })
        }

        static async patch(zip, data){
            if(data instanceof ArrayBuffer || data instanceof Uint8Array){
                return await zip.loadAsync(data, { createFolders: true });
            } else throw "Image must be of type ArrayBuffer or Uint8Array"
        }
    }


    let utf8_decoder = new TextDecoder("utf-8");
    let utf8_encoder = new TextEncoder("utf-8");

    let ascii_decoder = new TextDecoder("ascii");
    let ascii_encoder = new TextEncoder("ascii");

    let utf16le_decoder = new TextDecoder("utf-16le");
    let utf16le_encoder = new TextEncoder("utf-16le");

    let latin1_decoder = new TextDecoder("latin1");
    let latin1_encoder = new TextEncoder("latin1");

    LinuxJS.initRootFileSystem = function () {
        let fs = {
            mount_points: {},
            fileSystems: {},

            register_filesystem(name, constructor){
                fs.fileSystems[name] = constructor
            },

            mount(path, filesystem, device){
                path = fs.normalizePath(path);

                // TODO: Implement other arguments

                if(!fs.fileSystems[filesystem]) throw "unknown filesystem type '" + filesystem + "'.";
                // if(!fs.exists(path)) throw path + ": mount point does not exist.";

                fs.mount_points[path] = new fs.fileSystems[filesystem](device)
            },

            normalizePath(path, pwd){
                return LinuxJS.normalizePath(path, pwd)
            },

            async open(path, pwd){
                let object = await fs.getObject(path, pwd);
                return object.fileSystem.getDescriptor(object.relativePath);
            },

            async read(path, encoding = "uint8array", pwd){
                let object = await fs.getObject(path, pwd);

                let descriptor = object.fileSystem.getDescriptor(object.relativePath);

                if(typeof descriptor === "undefined") throw "ENOENT";

                if(descriptor.dir) throw "EISDIR";

                encoding = encoding.toLowerCase();

                let data = await object.fileSystem.read(descriptor);

                function toBinaryString(){
                    const uint8Array = new Uint8Array(data);

                    let result = '';

                    for(byte of uint8Array){
                        result += String.fromCharCode(byte)
                    }
                    
                    return result
                }

                switch(encoding){
                    case "arraybuffer":
                        return data;
                    case "uint8array":
                        return new Uint8Array(data);
                    case "uint16array":
                        return new Uint16Array(data);
                    case "uint32array":
                        return new Uint32Array(data);
                    case "string": case "utf8": case "utf-8": case "text":
                        return utf8_decoder.decode(data);
                    case "blob":
                        return new Blob([data]);
                    case "url":
                        return new URL.createObjectURL(Blob([data]));
                    case "json":
                        return JSON.parse(utf8_decoder.decode(data));
                    case "ucs2": case "ucs-2": case "utf16le": case "utf-16le":
                        return utf16le_decoder.decode(data);
                    case "latin1": case "binary":
                        return latin1_decoder.decode(data);
                    case "ascii":
                        return ascii_decoder.decode(data);
                    case "binarystring":
                        return toBinaryString(data);
                    case "base64":
                        return btoa(toBinaryString(data));
                    default:
                        throw "Unsupported encoding"
                }
            },

            async write(path, data, pwd){
                let object = await fs.getObject(path, pwd), descriptor;

                if(object.fileSystem.directWrites){

                    descriptor = object.relativePath

                } else {
                    descriptor = object.fileSystem.getDescriptor(object.relativePath);
    
                    if(typeof descriptor === "undefined") {
                        descriptor = object.fileSystem.createFile(path)
                    }
    
                    if(descriptor.dir) throw "EISDIR";
                }


                return await object.fileSystem.write(descriptor, data);
            },

            async rm(path, pwd){
                let object = await fs.getObject(path, pwd)
                object.fileSystem.remove(path)
            },

            async ls(path = "/", options = {}, pwd){
                let object = await fs.getObject(path, pwd), descriptor;

                descriptor = object.fileSystem.getDescriptor(object.relativePath);

                if(!descriptor) throw "ENOENT";
                if(!descriptor.dir) throw "ENOTDIR";

                let list = object.fileSystem.list(object.relativePath, !!options.directories, !!options.recursive);

                return list.map(thing => {

                    if(options.fullPath) return "/" + thing;
                    return thing.replace(object.relativePath, "").replace("/", "")

                })
            },

            async exists(path, pwd){
                let object = await fs.getObject(path, pwd)
                return !!object.fileSystem.getDescriptor(object.relativePath)
            },

            getNearestMountPointOf(path){
                let mountPoint = path, relativePath = ""

                if(fs.mount_points.hasOwnProperty(path)){

                    return [path, "", fs.mount_points[path]];

                } else while (mountPoint.length >= 1) {
                    let index = mountPoint.lastIndexOf("/");

                    relativePath = mountPoint.slice(index > 0? index: 0) + relativePath;
                    if(index > 0) mountPoint = mountPoint.slice(0, index); else mountPoint = "";

                    if(fs.mount_points[mountPoint]){
                        return [mountPoint, fs.normalizePath(relativePath), fs.mount_points[mountPoint]];
                    }
                }

                throw "No filesystem"
            },

            async getObject(path, pwd, options = {}){

                // Resolves a path to its mountpoint, resolves symbolic links, and finds the real path

                if(!fs.mount_points.hasOwnProperty("")) throw "Could not find a root filesystem. Please make sure you have something mounted at '/'";

                path = fs.normalizePath(path, pwd);

                if(fs.mount_points.hasOwnProperty(path)){
                    return {
                        fileSystem: fs.mount_points[path],
                        relativePath: "",
                        path,
                        mountPoint: path
                    }
                }

                let [mountPoint, relativePath, fileSystem] = fs.getNearestMountPointOf(path);

                if(fileSystem.resolveSymlinks){
                    let parts = path.split('/');
                    let resolvedPath = [];
                
                    for (let part of parts) {
                        resolvedPath.push(part);
                
                        let partialPath = resolvedPath.join('/');
                
                        let descriptor = fileSystem.getDescriptor(partialPath);
                
                        // The path is not a part of the filesystem anymore or was not found, so cancel the symlink lookup
                        if(!descriptor) break;

                        if(descriptor && !descriptor.dir && descriptor.unixPermissions && descriptor.unixPermissions.toString(8).startsWith("120")){
                            // Symlink found, follow it
                
                            // TODO: Proper implementation i guess. This implementation only works with JSZipFS, but that should not be a big problem, as other "filesystems" or handles will probably resolve symlinks on their own.
                            let symlinkContent = fs.normalizePath(await (await fileSystem.getDescriptor(partialPath)).async("text"));
                            
                            if(symlinkContent === partialPath) throw "ELOOP";

                            // Get any other symbolic links recursively across multiple filesystems, uh, maybeee?? idk
                            // let targetPath = (await fs.getObject(symlinkContent)).path;

                            // resolvedPath = targetPath.split('/');

                            if(options.__iteration > (options.maxSymlinkIteration || 100)) {
                                // The link has reached too large recursion level
                                throw "ELOOP"
                                // throw "EMLINK"
                            }

                            return await fs.getObject(fs.normalizePath(symlinkContent + "/" + parts.slice(resolvedPath.length).join("/")), null, {
                                __iteration: (options.__iteration || 0) +1
                            })
                        }
                    }
                }

                return {fileSystem, relativePath, path, mountPoint}
            },

            async isDirectory(path, pwd){
                let object = await fs.getObject(path, pwd)

                let descriptor = object.fileSystem.getDescriptor(object.relativePath);

                return !!(descriptor && descriptor.dir)
            },
            
            join(...path){
                return fs.normalizePath(path.join("/"))
            },

            async search(list, file, pwd){
                if(file.includes("/")) return "/" + fs.normalizePath(file, pwd);

                for(let searchPath of (Array.isArray(list)? list: list.split(":"))){
                    let files;

                    try {
                        files = await fs.ls(searchPath);
                    } catch { continue }
                    
                    if(files && files.includes(file)){
                        return "/" + fs.normalizePath(searchPath + "/" + file)
                    }
                }

                return file;
            },

            resolve(target, pwd){
                throw "This method is deprecated"
            },

            pathFind(file){
                throw "This method is deprecated"
            }
        }

        return fs
    }


    LinuxJS.normalizePath = function(path, pwd){
        // Relative paths
        if((path[0] === "." || path.slice(0, 2) === "..") && pwd) path = `${pwd}/${path}`;

        path = path.replace(/\\/g, '/');

        // Resolve '..' and '.' in the path
        const parts = path.split('/');
        const normalizedParts = [];
    
        for (const part of parts) {
            if (part === '..') {
                normalizedParts.pop();
            } else if (part !== '.' && part !== '') {
                normalizedParts.push(part);
            }
        }

        const normalizedPath = normalizedParts.join('/');

        return normalizedPath == "/"? "" : normalizedPath;
    }
    

    // Mostly just a helper for browsers
    LinuxJS.remoteImage = async function (url, callback){
        try {
            let request = await fetch(url);
        
            if(!request.ok) return callback(false);
    
            let data = await request.arrayBuffer()
    
            if(callback) callback(data)
            return data
    
        } catch (e) {
            if(callback) callback(false)
            throw e
        }
    }

    LinuxJS.signalHandler = function (target, parent) {
        let listeners = {};

        target.on = function (type, callback){
            if(!listeners[type]) listeners[type] = [];
            listeners[type].push(callback)
        }

        target.invoke = function (type, ...data){
            if(typeof parent[`on${type}`] === "function") parent[`on${type}`](...data)

            if(listeners[type]){
                for(let listener of listeners[type]) listener(...data)
            }
        }
    }

    processWorkerCode = (async function (run){
        let initialized = false, stdinlisteners = [], syscallCallbackID = 0, syscallCallbackListeners = {}, childProcessEvents = {};

        function registerChildStreamListeners(pid, listeners = {}){
            childProcessEvents[pid] = {
                out: listeners.out,
                err: listeners.err,
                exit: listeners.exit
            }
        }

        function syscall(call, options = {}){
            let callback = syscallCallbackID++

            postMessage({
                type: "syscall",
                to: call,
                callback,
                args: options.args || [],
                env
            })

            syscallCallbackListeners[callback] = options.callback || (() => {})
        }

        // Proxy FS
        fs = new Proxy({}, {
            get(target, key){
                return function proxyFunction(...args){
                    return new Promise((resolve, reject) => {
                        syscall("fs", {
                            args: [key, args],
                            callback(result){
                                if(result.error) return reject(result.error);
                                resolve(result.result)
                            }
                        })
                    })
                }
            }
        })

        self.onmessage = function (event) {
            // Signal received from host
            let signal = event.data;

            if(!signal || !signal.type) return;

            switch(signal.type){
                case "init":
                    if(initialized){
                        throw new Error("Forking (re-initialization) a process is currently not supported")
                    }

                    env = signal.env;

                    let globals = {
                        args: signal.args,
                        pwd: signal.pwd,

                        exit(code = 0){
                            postMessage({
                                type: "exit",
                                code
                            })
                        },

                        std: {
                            write(data){
                                postMessage({
                                    type: "stdout",
                                    data
                                })
                            },

                            writeError(data){
                                postMessage({
                                    type: "stderr",
                                    data
                                })
                            },

                            onData(listener){
                                stdinlisteners.push(listener)
                            }
                        },

                        exec(command, pwd, arguments, listeners){
                            return new Promise(resolve => {
                                globals.call("exec", {
                                    args: [command, pwd, arguments],

                                    callback: pid => {

                                        if(pid.error){
                                            resolve({error: pid.error})
                                        }

                                        if(listeners){
                                            registerChildStreamListeners(pid, listeners)
                                        }

                                        resolve({
                                            pid,

                                            write(data){
                                                postMessage({
                                                    type: "stream_pipe_in",
                                                    pid,
                                                    data
                                                })
                                            },

                                            terminate(){
                                                postMessage({
                                                    type: "stream_pipe_signal",
                                                    pid,
                                                    value: 15
                                                })
                                            },

                                            kill(){
                                                console.log(pid);
                                                
                                                postMessage({
                                                    type: "stream_pipe_signal",
                                                    pid,
                                                    value: 9
                                                })
                                            },

                                            signal(value){
                                                postMessage({
                                                    type: "stream_pipe_signal",
                                                    pid,
                                                    value
                                                })
                                            }
                                        })
                                    }
                                })
                            })
                        },

                        registerChildStreamListeners,

                        call: syscall
                    };

                    run(globals)
                break

                case "signal":
                    // TODO: Handle signals
                    switch(signal.value){
                        case 15: // Terminate
                            // TODO: Handle graceful termination
                            postMessage({
                                type: "exit",
                                code: 143
                            })
                        break

                        case 9: // Kill
                            postMessage({
                                type: "exit",
                                code: 137
                            })
                    }
                break

                case "stdin":
                    for(let listener of stdinlisteners) listener(signal.data)
                break

                case "callback":
                    if(syscallCallbackListeners[signal.callback]){
                        syscallCallbackListeners[signal.callback](signal.data)
                        syscallCallbackListeners[signal.callback] = null
                    }
                break

                case "stream_pipe_out":
                    if(childProcessEvents[signal.pid] && typeof childProcessEvents[signal.pid].out === "function") childProcessEvents[signal.pid].out(signal.data)
                break

                case "stream_pipe_err":
                    if(childProcessEvents[signal.pid] && typeof childProcessEvents[signal.pid].err === "function") childProcessEvents[signal.pid].err(signal.data)
                break

                case "stream_pipe_exit":
                    if(childProcessEvents[signal.pid] && typeof childProcessEvents[signal.pid].exit === "function") childProcessEvents[signal.pid].exit(signal.code)    
                break
            }
        };
    }).toString()


    LinuxJS.createProccessSource = function (code) {
        if(typeof code !== "string"){
            throw "This type of executable is not supported yet."
        }

        code = `let env,fs;(${processWorkerCode})(async ({args, pwd, exit, std, call, exec, registerChildStreamListeners}) => {${code}})`

        return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    }

    LinuxJS.revokeProccessSource = function (source) {
        return URL.revokeObjectURL(source)
    }


    // Both Node.JS and browser environments
    if (typeof module === 'object' && module.exports) {
        module.exports = LinuxJS;
    } else {
        global.LinuxJS = LinuxJS;
    }
})(typeof self !== 'undefined' ? self : this)