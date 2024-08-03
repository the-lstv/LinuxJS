

/*

    This is the same code that is used for the "ssh LinuxJS-Demo@extragon.cloud" demo!
    This is not really meant to be used as an exmaple, its more of a hacked-together proof of concept.

*/


let LinuxJS = require("../LinuxJS"),
    fs = require("fs"),
    readline = require("readline")
;


// Needed to allow full passthrough of the Node stdin to our virtual bash shell
readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');

(async () => {

    // Prevent development yapping
    // console.log = () => {}; 
    // console.warn = () => {};

    let os;

    try {
        os = await LinuxJS({
            image: fs.readFileSync("../images/base_os.img"),
        })
    } catch (error) {
        if(error.toString().startsWith("JSZip")){
            console.error("Cannot find required module 'jszip', please install jszip to be able to run this script.");
        }

        process.exit()
    }

    // Add the demo message
    os.fs.write("/etc/motd", await os.fs.read("/etc/motd", "utf8") + "\n\x1b[1mWelcome, user! Thanks for trying out the public LinuxJS SSH Demo.\x1b[0m\nThis is not a real Linux environment!\nEverything you see or do here (including the shell) is all handled by a single JS library.\nAll files are temporary (including the system) and after you log-out, they will be lost forever.\nMore about the library: https://github.com/the-lstv/LinuxJS\n\n")

    // await os.boot();

    // Push stdout of the bash process to the output
    let bash = os.process('bash', null, ["-i"], {
        onstdout(data){
            process.stdout.write(data)
        },

        onstderr(data){
            process.stderr.write(data)
        },

        onexit(code){
            // When the bash exits, exit the host process
            process.exit(code)
        }
    })

    // Push stdin to the bash process
    process.stdin.on("data", data => {
        bash.std.in = data.toString()
    })
})()