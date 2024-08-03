
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
        let os, fs = LinuxJS.initFS({
            storage: new JSZip(),
            get env(){
                return os.env
            }
        });

    
        // Allows patches with multiple images/packages
        if(!Array.isArray(options.image)) options.image = [];

        for(let image of options.image){
            if(!image instanceof ArrayBuffer) throw "System image must an arrayBuffer.";
            await fs.patchWithImage(image)
        }


        let lastPID = 1;

        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

        // Init the "os" object
        os = {
            // Default global environmnet variables
            env: {
                PATH: "/bin:/usr/bin",
    
                LANG: global.navigator? navigator.language: global.process? global.process.env.LANG: "en_US.UTF-8",
    
                HOME: "/root", // Update later when managing user accounts
                USER: "root",

                ...options.env? options.env: {}
            },
    
            fs,
    
            stdio(options = {}){
        
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

            process(executable, pwd, args = [], options = {}) {
                let pid = lastPID++
        
                let thing = (_this => class Process {
                    constructor(){
                        _this = this;
        
                        this.pid = pid;
            
                        executable = "/" + os.fs.normalizePath(os.fs.pathFind(executable));
            
                        let executable_path = "/" + executable.split("/").filter(garbage => garbage).slice(0, -1).join("/") + "/";
            
                        let object = os.fs.get(executable);
            
                        // Initialize standard input output system
            
                        _this.std = os.stdio(options.stdioOptions || {});
                        this.std.onstdin = options.onstdin || null;
                        this.std.onstdout = options.onstdout || null;
                        this.std.onstderr = options.onstderr || null;
        
            
                        if(!object || object.dir) {
                            let error = !object? (executable + ": No such file or directory") : (executable + ": Is a directory")
            
                            this.std.err = error
                            if(options.onexit) options.onexit(2)
                            _this.terminate()
            
                            throw error
                        }
            
                        if(!pwd) pwd = executable_path;
            
                        this.pwd = "/" + os.fs.normalizePath(pwd + "/");
            
                        this.options = options
                        this.file_handle = object
                        this.source_exec = executable
                        this.source = executable_path
                        this.args = args
            
                        if(!options.delay) this.launch()
                    }
            
                    launch(){
                        return new Promise(async (resolve, reject) => {
                            let data = await os.fs.read(_this.source_exec, "text"), match;
            
                            if(data.startsWith("#!")) match = data.match(/^#!(.*)\n/);
            
                            if(data.startsWith("#!") && match && match[1]){
                                const shell = match[1].trim();
            
                                data = data.replace(match[0], "");
            
                                switch(shell){
                                    // Some pre-defined virtual interpreters
            
                                    case "/bin/js": case "/bin/node": case "/usr/bin/env node":
                                        let std = _this.std,
                                            pwd = _this.pwd,
                                            args = _this.args,
                                            env = this.options.env || {},
                                            process = _this,
                                            code = null
                                        ;
            
                                        function exit(code = 0){
                                            resolve(code)
        
                                            _this.terminate(code)
        
                                            // throw new Error(`exit:${code}`)
                                        }
            
                                        let handle = new AsyncFunction('os', 'std', 'args', 'pwd', "process", "exit", "env", "global", data);
            
                                        try {
                                            code = await handle(os, std, args, pwd, process, exit, env, global);
                                        } catch (error) {
            
                                            if(error && typeof error.message == "string" && error.message.startsWith("exit:")) {
                                                return
                                            }
            
                                            _this.std.stderr = error.toString();
            
                                        }
                                    case "/bin/bash":
                                        // TODO: Add a shellscript interptetter
                                        break;
            
                                    default:
                                        // TODO: Implement interpreter pass
                                        break;
                                }
                            } else {
                                throw "This type of executable is not supported at this moment. (Or, maybe you forgot to specify the target with a shebang (#! ...) ?)"
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
            
                let proccess = new thing();
        
                os.proc[pid] = proccess;
                return proccess
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
        os.std = os.stdio();
        
        // os.import = function (what) {
        //     // TODO: Add permissions etc
        
        //     return app[what]
        // }

        return os;
    }


    LinuxJS.initFS = function (os) {
        let fs = {
            get storage(){
                return os.storage
            },

            supportedEncodings: [...Object.keys(JSZip.support).filter(key => JSZip.support[key]), "binarystring", "url"],

            normalizePath(path){
                // Replace backslashes with forward slashes
                path = path.replace(/\\/g, '/');
            
                // Resolve '..' and '.' in the path
                const parts = path.split('/');
                const normalizedParts = [];
            
                for (const part of parts) {
                    if (part === '..') {
                        // Pop the last directory off the stack if '..' encountered
                        normalizedParts.pop();
                    } else if (part !== '.' && part !== '') {
                        // Ignore '.' and empty parts
                        normalizedParts.push(part);
                    }
                }
            
                // Join the parts to form the normalized path
                const normalizedPath = normalizedParts.join('/') + (path.endsWith("/")? "/" : "");

                return normalizedPath == "/"? "" : normalizedPath;
            },

            async read(path, encoding = "uint8array"){
                path = fs.normalizePath(path);

                let object = fs.get(path);

                if(!object) throw path + ": No such file or directory";
                if(object.dir) throw object.name + ": Is a directory";

                if(object.unixPermissions && object.unixPermissions.toString(8).startsWith("120")){
                    // The file is a symlink - follow it;

                    let realPath = fs.normalizePath(await object.async("text"));
                    
                    if(realPath == path) throw path + ": Symlink is looping forever!";
                    if(!fs.exists(realPath)) throw path + ": Broken symlink (pointing to " + realPath + ")";

                    return fs.read(realPath, encoding)
                }

                if(["ascii", "utf8", "text"].includes(encoding)) encoding = "string";
                if(!fs.supportedEncodings.includes(encoding)) throw "Unsupported encoding";

                let data = await object.async(encoding == "url"? "blob" : encoding);
                return encoding == "url"? URL.createObjectURL(data) : data
            },

            write(path, data){
                path = fs.normalizePath(path)

                fs.storage.file(path, data)
            },

            rm(path){
                path = fs.normalizePath(path)

                fs.storage.remove(path)
            },

            ls(path = "/", options = {}){
                path = fs.normalizePath(path + "/")

                return Object.keys(fs.storage.files).filter(found_path => {
                    found_path = fs.normalizePath(found_path);

                    if(found_path == path) return false;

                    let contained = found_path.startsWith(path),
                        object = fs.get(found_path),
                        depth = (found_path.split("/").length - (object.dir? 1 : 0)) - path.split("/").length
                    ;

                    return contained
                            && (options.directories? object.dir : true)
                            && (options.recursive? true : depth == 0 )

                }).map(thing => {

                    if(options.fullPath) return "/" + thing;
                    return thing.replace(path, "")

                })
            },

            exists(path){
                let object = fs.get(path)

                return !!object
            },

            get(path){
                // TODO: Add logic to detect different mount points etc
                path = fs.normalizePath(path)

                if(!fs.storage.files[path]){
                    path = path.endsWith("/")? path.slice(0, -1) : path + "/";
                }

                return fs.storage.files[path];
            },

            isDirectory(path){
                let object = fs.get(path)

                return object? object.dir : false
            },

            async patchWithImage(image){
                if(image instanceof ArrayBuffer || image instanceof Uint8Array){
                    fs.storage = await fs.storage.loadAsync(image, { createFolders: true });
                } else throw "Image must be of type ArrayBuffer or Uint8Array"
            },

            async export(type = "uint8array"){
                return await fs.storage.generateAsync({
                    type,
                    platform: "UNIX"
                })
            },

            resolve(target, pwd){
                if(target.startsWith("/")) return target;

                else return "/" + fs.normalizePath(pwd + "/" + target)
            },

            pathFind(file){
                if(file.includes("/")) return file;

                for(let path of os.env.PATH.split(":")){
                    let files = fs.ls(path);

                    if(files && files.includes(file)){
                        return "/" + fs.normalizePath(path + "/" + file)
                    }
                }

                return file;
            }
        }

        return fs
    }
    
    
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

    if (typeof module === 'object' && module.exports) {
        module.exports = LinuxJS;
    } else {
        global.LinuxJS = LinuxJS;
    }
})(typeof self !== 'undefined' ? self : this)