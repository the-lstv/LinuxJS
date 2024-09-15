

/*

    This is the same code that is used for the "ssh root@extragon.cloud -p 2022" demo!

    This is not really meant to be used as an exmaple, its more of a hacked-together proof of concept.

    This will launch a SSH server at :2022 that will create a NEW LinuxJS instance each time.



    NOTE: If you want to simulate a more proper SSH server running on a single LinuxJS instance (so your files persist across connections), you can do that easily by defining a global instance instead of a new one each time, and simply only creating a new bash process (all this should take is moving the "os = await LinuxJS" lines to the top)
    You may then also want to enable FileSystem passthrough (or export the virtual one when needed) so that your files are actually stored to the disk instead of memory-only.

*/


let LinuxJS = require("../LinuxJS"),
    fs = require("fs"),
    readline = require("readline"),
    { Server } = require('ssh2')
;


let exec = require("child_process").execSync;

const conn = new Server({
    hostKeys: [ require('fs').readFileSync('host.key') ]
}, (client) => {
    console.log('Client connected!');

    let username = "root", password, input = "";

    client.on('authentication', (ctx) => {

        if(ctx.method === 'password') return ctx.accept();

        let accounts = {
            root: ["linuxjs", "toor", "", "admin", "123", "root"],
            admin: "admin",
            rmpass: "-"
        }

        password = ctx.password || "none";

        if (ctx.method === 'password' && (Array.isArray(accounts[ctx.username])? accounts[ctx.username].includes(password): accounts[ctx.username] === password)) {
            username = ctx.username
            password = password
            ctx.accept();
        } else {
            console.log(`Rejected connection with method ${ctx.method} and credintals "${ctx.username}" password "${password}"`);
            ctx.reject();
        }
    }).on('ready', async () => {
        console.log('Client authenticated!');


        client.on('session', (accept, reject) => {
            const session = accept();

            session.once('pty', (accept, reject, info) => {
                accept();
            });

            session.once('shell', async (accept, reject) => {
                let os;

                try {
                    os = await LinuxJS({
                        image: fs.readFileSync(__dirname + "/../images/base_os.img"),
                        env: {
                            HOSTNAME: "extragon.cloud"
                        }
                    })
                } catch (error) {
                    if(error.toString().startsWith("JSZip")){
                        console.error("Cannot find required module 'jszip', please install jszip to be able to run this script.");
                    } else console.error(error);

                    return reject()
                }

                function createCommand(name, code){
                    if(typeof code === "function") {
                        code = `(${code.toString()})(os, std, args, pwd, process, exit, env, global)`
                    }

                    os.fs.write("/usr/bin/" + name, "#! /bin/js\n" +code);
                }

                const stream = accept();

                if(password !== "linuxjs") {
                    let Image = (await import("/www/node/shared_modules/node_modules/terminal-image/index.js")).default;
        
                    let user = `Welcome, \x1b[31m${username}`, image = "/img.png";
                 
                    (tryImage => {
                       tryImage = `/img-${username.toLowerCase()}.png`;
                       if(fs.existsSync(tryImage)) return image = tryImage;
                    
                       tryImage = `/.akeno/img-${username.toLowerCase()}.png`;
                       if(fs.existsSync(tryImage)) return image = tryImage;
                 
                       tryImage = `${process.env.HOME}/.akeno/img.png`;
                       if(fs.existsSync(tryImage)) return image = tryImage;
                 
                       tryImage = `${process.env.HOME}/img.png`;
                       if(fs.existsSync(tryImage)) return image = tryImage;
                 
                       tryImage = `/.akeno/img.png`;
                       if(fs.existsSync(tryImage)) return image = tryImage;
                    })();
                 
                    stream.write("\n\r" + (await Image.file(image, {width: 20})).split("\n").map((line, i) => {
                       if(i < 20){
                          if(i == 0) line += `  \x1b[90m┌─────────────────────────────────────────┐\x1b[0m`
                          
                          if(i == 2) line += `  \x1b[1m${" ".repeat(21 - (user.length / 2))}${user}\x1b[0m!`
                          if(i == 3) line += `      You are running the \x1b[1m\x1b[93mAkeno\x1b[0m backend`
                          if(i == 4) line += `       View more info with \x1b[1m"akeno -i"\x1b[0m!`
                 
                          if(i == 6) line += `     The server is ${String(exec("uptime -p")).trim()}`
                          if(i == 7) line += `    You are currently in a ${fs.existsSync("/www/__dev__")? "dev": "prod"} environment.`
                 
                          if(i == 9) line += `  \x1b[90m└─────────────────────────────────────────┘\x1b[0m`
                       }

                       return line
                    }).join("\n\r"));
                }

                await os.boot();

                console.log("Finished booting a demo instance");

                // Add the demo message
                os.fs.write("/etc/motd", password !== "linuxjs"? "\n\x1b[1m[ 🔐 ] This server is protected by \x1b[95mAkeno\x1b[0m.\x1b[0m\n" : await os.fs.read("/etc/motd", "utf8") + "\n\x1b[1mWelcome, user! Thanks for trying out the public LinuxJS SSH Demo.\x1b[0m\nThis is not a real Linux environment!\nEverything you see or do here (including the shell) is all handled by a single JS library.\nAll files are temporary (including the system) and after you log-out, they will be lost forever.\nMore about the library: https://github.com/the-lstv/LinuxJS\n\n")
                
                createCommand("akeno", function (os, std, args, pwd, process, exit, env, global) {
                    std.write("\x1b[31mFor security reasons, this command can only be run after you authenticate via LSTV Cloud first.\x1b[0m")
                    exit()
                })

                createCommand("neofetch", `std.write(\`[?25l[?7l[38;5;12m[1m             .',;::::;,'.
         .';:cccccccccccc:;,.
      .;cccccccccccccccccccccc;.
    .:cccccccccccccccccccccccccc:.
  .;ccccccccccccc;[37m[0m[1m.:dddl:.[38;5;12m[1m;ccccccc;.
 .:ccccccccccccc;[37m[0m[1mOWMKOOXMWd[38;5;12m[1m;ccccccc:.
.:ccccccccccccc;[37m[0m[1mKMMc[38;5;12m[1m;cc;[37m[0m[1mxMMc[38;5;12m[1m:ccccccc:.
,cccccccccccccc;[37m[0m[1mMMM.[38;5;12m[1m;cc;[37m[0m[1m;WW:[38;5;12m[1m:cccccccc,
:cccccccccccccc;[37m[0m[1mMMM.[38;5;12m[1m;cccccccccccccccc:
:ccccccc;[37m[0m[1moxOOOo[38;5;12m[1m;[37m[0m[1mMMM0OOk.[38;5;12m[1m;cccccccccccc:
cccccc:[37m[0m[1m0MMKxdd:[38;5;12m[1m;[37m[0m[1mMMMkddc.[38;5;12m[1m;cccccccccccc;
ccccc:[37m[0m[1mXM0'[38;5;12m[1m;cccc;[37m[0m[1mMMM.[38;5;12m[1m;cccccccccccccccc'
ccccc;[37m[0m[1mMMo[38;5;12m[1m;ccccc;[37m[0m[1mMMW.[38;5;12m[1m;ccccccccccccccc;
ccccc;[37m[0m[1m0MNc.[38;5;12m[1mccc[37m[0m[1m.xMMd[38;5;12m[1m:ccccccccccccccc;
cccccc;[37m[0m[1mdNMWXXXWM0:[38;5;12m[1m:cccccccccccccc:,
cccccccc;[37m[0m[1m.:odl:.[38;5;12m[1m;cccccccccccccc:,.
:cccccccccccccccccccccccccccc:'.
.:cccccccccccccccccccccc:;,..
  '::cccccccccccccc::;,.[0m
[19A[9999999D[41C[0m[1m[38;5;12m[1mroot[0m@[38;5;12m[1mextragon.cloud[0m 
[41C[0m--------------[0m 
[41C[38;5;12m[1mOS[0m[0m:[0m Fedora Linux 39 (Server Edition) x86_64[0m 
[41C[38;5;12m[1mKernel[0m[0m:[0m 6.9.7-100.fc39.x86_64[0m 
[41C[38;5;12m[1mUptime[0m[0m:[0m ${String(exec("uptime -p")).trim()}[0m 
[41C[38;5;12m[1mPackages[0m[0m:[0m 3367 (rpm), 31 (flatpak)[0m 
[41C[38;5;12m[1mShell[0m[0m:[0m wrapped-bash 5.2.26[0m 
[41C[38;5;12m[1mResolution[0m[0m:[0m 2560x1440[0m 
[41C[38;5;12m[1mTerminal[0m[0m:[0m /dev/pts/0[0m 
[41C[38;5;12m[1mCPU[0m[0m:[0m AMD Ryzen 9 5900X (24) @ 3.700GHz[0m 
[41C[38;5;12m[1mGPU[0m[0m:[0m NVIDIA GeForce RTX 3070 Lite Hash Rate[0m 
[41C[38;5;12m[1mMemory[0m[0m:[0m 21834MiB / 64203MiB[0m

[41C[30m[40m   [31m[41m   [32m[42m   [33m[43m   [34m[44m   [35m[45m   [36m[46m   [37m[47m   [m
[41C[38;5;8m[48;5;8m   [38;5;9m[48;5;9m   [38;5;10m[48;5;10m   [38;5;11m[48;5;11m   [38;5;12m[48;5;12m   [38;5;13m[48;5;13m   [38;5;14m[48;5;14m   [38;5;15m[48;5;15m   [m


[?25h[?7h

\`.replaceAll("\\n", "\\n\\r"));exit()`)

                // Push stdout of the bash process to the output
                let bash = await os.process('bash', "/root", ["-i"], {
                    onstdout(data){
                        stream.write(data);
                    },

                    onstderr(data){
                        stream.write(data);
                    },

                    onexit(code){
                        stream.close()
                    }
                })

                stream.on('data', (data) => {
                    input += data.toString()
                    console.log(input);
                    bash.std.in = data.toString(); // Send data to your virtual shell
                });

                // stream.on('close', () => {
                //     bash.terminate();
                //     // If necessary, here we clear the LinuxJS instance
                // });
            });
        });
    }).on('end', () => {
        console.log('Client disconnected');
    });
});

conn.listen(22, '0.0.0.0', () => {
    console.log('Listening on port 22');
});

// process.stdin.setRawMode(true);
// process.stdin.setEncoding('utf8');