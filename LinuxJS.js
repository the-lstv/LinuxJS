
(global => {
    let JSZip;

    if(typeof require === "function"){
        try {
            JSZip = require('jszip');
        } catch (e) {
            JSZip = null;
        }
    }

    // Breaking change: Since 0.4, the filesystem has been totally reworked, but now sadly requires every single method to be async and awaited (due to an internal read method required for symlinks).
    // This means that you now have to use async/await everywhere :(

    async function LinuxJS(options = {}){
        if(!JSZip && !global.JSZip && !options.JSZip){
            throw "JSZip is required for LinuxJS to run. Either expose it globally as 'JSZip' or provide it via options."
        } else if(!JSZip) JSZip = global.JSZip || options.JSZip;


        if(!options.image) throw "You must specify a virtual system image/copy!";

        // Initization of the filesystem;


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
                return lastPID
            },
    
            proc: {},
            shared: {},
    
            exec(command, options = {}) {
                // TODO: Use bash

                command = command.split(" ");
                return os.process(command[0], options.pwd || null, command.slice(1), options)
            },

            async process(executable, pwd, args = [], options = {}) {
                let pid = lastPID++, prepared = false;
        
                let thing = (_this => class Process {
                    constructor(){
                        _this = this;
                        this.options = options;
                        this.pid = pid;
                    }

                    async _init_(){

                        /*
                            This function just looks for where the binary/script are located and prepares the procces for launch.
                            Normally this should be a part of the constructor, but it is not because it requires "await" due to filesystem operations.
                        */

                        if(prepared) throw "Cannot call ._init_() twice!";

                        executable = "/" + os.fs.normalizePath(await os.fs.search(os.env.PATH, executable));

                        let executable_path = "/" + executable.split("/").filter(garbage => garbage).slice(0, -1).join("/") + "/";
            
                        let object = await os.fs.getObject(executable, pwd);
                        let descriptor = object.fileSystem.getDescriptor(object.relativePath);

                        // Initialize standard input output system

                        _this.std = LinuxJS.stdio(options.stdioOptions || {});
                        this.std.onstdin = options.onstdin || null;
                        this.std.onstdout = options.onstdout || null;
                        this.std.onstderr = options.onstderr || null;

                        if(!descriptor || descriptor.dir) {
                            let error = !descriptor? "ENOENT" : "EISDIR";
            
                            this.std.err = error
                            if(options.onexit) options.onexit(2)
                            _this.terminate()
            
                            throw error
                        }
            
                        if(!pwd) pwd = executable_path;

                        this.pwd = "/" + os.fs.normalizePath(pwd + "/");

                        this.file_handle = descriptor
                        this.source_exec = executable
                        this.source = executable_path
                        this.args = args

                        prepared = true;
                        if(!options.delayStart && !options.delay) this.run()
                    }

                    run(){
                        if(!prepared) throw "Process was not prepared yet!";

                        return new Promise(async (resolve, reject) => {
                            let data = await os.fs.read(_this.source_exec, "arraybuffer");
            
                            if(decoder.decode(data.slice(0, 2)) === "#!") {

                                // The executable is a script starting with a "shebang".

                                data = decoder.decode(data)

                                let match = data.match(/^#!(.*)\n/);

                                if(match && match[1]){
                                    const shell = match[1].trim();

                                    data = data.replace(match[0], "");
                
                                    switch(shell){
                                        // Some hard-coded interpreters
                                        // FIXME: Fix this
                
                                        case "/bin/js": case "/usr/bin/js": case "/usr/bin/node": case "/bin/node": case "/usr/bin/env node":
                                            let std = _this.std,
                                                pwd = _this.pwd,
                                                args = _this.args,
                                                env = _this.options.env || {},
                                                process = _this,
                                                code = null
                                            ;
                
                                            function exit(code = 0){
                                                resolve(code)
            
                                                _this.terminate(code)
            
                                                throw `exit:${code}`
                                            }
                
                                            // TODO: Cache functions to boost performance (eliminate the need to re-compile each time)
                                            let handle = new AsyncFunction('os', 'std', 'args', 'pwd', "process", "exit", "env", "global", data);
                
                                            try {
                                                code = await handle(os, std, args, pwd, process, exit, env, global);
                                            } catch (error) {
                
                                                if(error && typeof error.message == "string" && error.message.startsWith("exit:")) {
                                                    return
                                                }
                
                                                _this.std.stderr = error.toString();

                                            }
                
                                        default:
                                            // TODO: Implement interpreter pass
                                            break;
                                    }
                                
                                } else {
                                    throw "bad interpreter: No such file or directory"
                                }
                            }
                        })
                    }
        
                    signal(signal){
                        // Handle signals
                    }
        
                    terminate(code = 0){
                        // TODO: ...
        
                        if(typeof code != "number" || code < 0 || code > 255) throw new Error("Invalid exit code \""+ code + "\". Only a number from 0 to 255 is allowed.");
        
                        if(_this.options.onexit) _this.options.onexit(code)
                        _this.std.clearBuffers()
        
                        delete os.proc[pid]
                    }
                })()
            
                let process = new thing();
        
                os.proc[pid] = process;

                await process._init_()

                return process
            },

            // Probably soon to be deprecated!
            terminalUtils: {
                gradient(text, from = 196, to = 204) {
                    console.warn("os.terminalUtils is soon to be deprecated!");

                    let gradientColors = [],
                        lines = text.split('\n'),
                        steps = lines.length,
                        start = from,
                        end = to,
                        step = (end - start) / steps;
                    ;
                
                    for (let i = 0; i < steps; i++) {
                        const color = start + Math.round(step * i);
                        gradientColors.push(`\x1b[38;5;${color}m`);
                    }
                
                    let gradientText = "", i = -1;
                    for (let line of lines) {
                        i++
                        gradientText += gradientColors[i] + line + "\n";
                    }
                    gradientText += "\x1b[0m";
                
                    return gradientText;
                }
            }
        }
    
        // Global system stdio
        os.std = LinuxJS.stdio();
        
        // os.import = function (what) {
        //     // TODO: Add permissions etc
        
        //     return app[what]
        // }

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


    LinuxJS.stdio = function (options = {}){
        
        // Note that this is just a middleman between the process and your implementation

        let defaults = {
            buffer: false
        }

        options = global.LS? LS.Util.defaults(defaults, options): {...defaults, ...options}

        return new ((_this => class StandardInputOutput {
            constructor(){
                _this = this;

                // this.buffer = {
                //     in: [],
                //     out: [],
                //     err: []
                // };

                this.options = options;

                if(global.LS && LS.EventResolver) new (LS.EventResolver()) (this);

                this.listeners = {};

                Object.defineProperties(this, {
                    stdin: {
                        set(data){
                            // if(_this.options.buffer) _this.buffer.in.push(...data)

                            if(_this.onstdin) _this.onstdin(data)
                            if(_this.options.onstdin) _this.options.onstdin(data)

                            _this.invoke("stdin", data)
                        },

                        get(){
                            // return _this.buffer.in
                        }
                    },

                    stdout: {
                        set(data){
                            // if(_this.options.buffer) _this.buffer.out.push(...data)

                            if(_this.onstdout) _this.onstdout(data)
                            if(_this.options.onstdout) _this.options.onstdout(data)

                            _this.invoke("stdout", data)
                        },

                        get(){
                            // return _this.buffer.out
                        }
                    },

                    stderr: {
                        set(data){
                            // if(_this.options.buffer) _this.buffer.err.push(...data)

                            if(_this.onstderr) _this.onstderr(data)
                            if(_this.options.onstderr) _this.options.onstderr(data)
                            _this.invoke("stderr", data)
                        },

                        get(){
                            // return _this.buffer.err
                        }
                    },


                    // Aliases

                    in: {
                        set(data){
                            return _this.stdin = data
                        },

                        get(){
                            return _this.stdin
                        }
                    },

                    out: {
                        set(data){
                            return _this.stdout = data
                        },

                        get(){
                            return _this.stdout
                        }
                    },

                    err: {
                        set(data){
                            return _this.stderr = data
                        },

                        get(){
                            return _this.stderr
                        }
                    },
                })
            }

            write(data){
                _this.stdout = data
            }

            error(data){
                _this.stderr = data
            }

            input(data){
                _this.stdin = data
            }

            clearBuffers(){
                // _this.buffer.in = []
                // _this.buffer.out = []
                // _this.buffer.err = []
            }


            // Simple alternate event resolver in case LS is not present
            on(event, callback){
                if(!_this.listeners[event]) _this.listeners[event] = [];
                _this.listeners[event].push(callback)
            }

            invoke(event, data){
                if(!_this.listeners[event]) return;
                for(let callback of _this.listeners[event]) callback(data);
            }
        })())
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



    // Both Node.JS and browser environments
    if (typeof module === 'object' && module.exports) {
        module.exports = LinuxJS;
    } else {
        global.LinuxJS = LinuxJS;
    }
})(typeof self !== 'undefined' ? self : this)