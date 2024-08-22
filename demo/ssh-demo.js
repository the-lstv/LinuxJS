

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


const conn = new Server({
    hostKeys: [ require('fs').readFileSync('host.key') ]
}, (client) => {
    console.log('Client connected!');

    client.on('authentication', (ctx) => {
        if (ctx.method === 'password' && ctx.username === 'root' && ctx.password === 'linuxjs') {
            ctx.accept();
        } else {
            console.log("Rejected connection with method", ctx.method, "and credintals", ctx.username, ctx.password);
            ctx.reject();
        }
    }).on('ready', () => {
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
                    })
                } catch (error) {
                    if(error.toString().startsWith("JSZip")){
                        console.error("Cannot find required module 'jszip', please install jszip to be able to run this script.");
                    } else console.error(error);

                    return reject()
                }

                const stream = accept();

                await os.boot();

                // Add the demo message
                os.fs.write("/etc/motd", await os.fs.read("/etc/motd", "utf8") + "\n\x1b[1mWelcome, user! Thanks for trying out the public LinuxJS SSH Demo.\x1b[0m\nThis is not a real Linux environment!\nEverything you see or do here (including the shell) is all handled by a single JS library.\nAll files are temporary (including the system) and after you log-out, they will be lost forever.\nMore about the library: https://github.com/the-lstv/LinuxJS\n\n")

                // Push stdout of the bash process to the output
                let bash = await os.process('bash', null, ["-i"], {
                    onstdout(data){
                        console.log("out:", data);
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
                    console.log(data.toString());
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

conn.listen(2022, '0.0.0.0', () => {
    console.log('Listening on port 2022');
});

// process.stdin.setRawMode(true);
// process.stdin.setEncoding('utf8');