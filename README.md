<p align="center">
  <img src="https://d311dyy4cric87.cloudfront.net/file/c623c97932b119c5eb89ebb37c699cf2.webp" alt="LinuxJS Logo">
</p>

# LinuxJS

> ### "Imagine being able to emulate a full Linux-like environment in any website/application, for any purpose of any scale, from just a simple, tiny library, with no extra overhead"

LinuxJS is a project that emulates an entire Linux environment in vanilla JavaScript as closely as possible.<br>
Its lightweight (just about 15Kb uncompressed!), fast, and licensed under the GPL 3.0 license.<br>
LinuxJS runs in both browser and Node.JS environments with no changes or bundling necessary.

---

Note that this is not hardware/bytecode emulation.<br>
The system is rewritten entirely in vanilla JavaScript. You could say that this is a "port" of Linux into JavaScript.<br>
BUT, also note that this is not just any simple "simulator" - the goal is to have a cross-compatible and fully functional environment, which emulates a real Linux machine as closely as possible.

I would go as far as to say that this is one of the, if not **THE most accurate** Linux system simulation ever made.<br>
It also has some practical uses!!

Its accuracy and ability to execute bash can be confirmed/benchmarked by running the original, unmodified neofetch command, straight from the oficial neofetch repo!<br>
Yes, all that can be done with just pure JS!<br>
In the provided default image, neofetch is already included so you can run it straight away (and also available via the package manager).<br>
But if you don't believe me, just take neofetch from your own /bin/neofetch and put it in a LinuxJS /bin/neofetch - and see the magic!<br><br>

The LinuxJS.js file is only a library that provides filesystem and stdio APIs - everything about the system itself, including the bash, is entirely inside the system image, which is built to precisely follow the structure of the GNU+Linux system, as much as it can.<br>
This means that they are somewhat compatible and if the executables weren't JavaScript, then the image could very well be an actual Linux distro (well, without the actual operating system and kernel).

---

**Current version:** 0.3<br>
## Demo
Wanna see it in action? Simply SSH into `LinuxJS-Demo@extragon.cloud` with the password `linuxjs` and see for yourself!<br>
Its almost hard to believe that the system is not an actual Linux machine at all, but everything is handled by a small JavaScript library!
![Screenshot from 2024-08-02 22-45-15](https://github.com/user-attachments/assets/c57fb80d-7c8b-45e2-8bfb-ea9f87623f37)

(Note: All files in the demo are only in-memory, once you end the session everything will be lost. Go ahead, try the `rm -rf /` :D)

## Features


| Feature                      | Status       |
|------------------------------|--------------|
| 📁 Virtual File System | ✔ Implemented |
| 📁 Advanced File System (mountpoints, symlinks..) | ⚠ Partial |
| 🕹️ JavaScript API | ✔ Implemented |
| 🔮 Process + stdio emulation | ✔ Implemented |
| 💻 Compatible with terminal emulators | ✔ Implemented |
| 💻 Bash Shell | ✔ Implemented |
| 💻 Shell Script | ⚠ Partial |
| 💻 Node.JS emulation, port builtin modules | ⚠ Partial |
| 💻 PATH variable, run custom scripts, lib64, usr/bin | ✔ Implemented |
| 📝 usr | ⚠ Partial |
| 📝 Common commands (ls, cd, pwd, mkdir, rm, ...) | ⚠ Partial |
| 👥 User Management, passwd | 🛠 Planned |
| 👤 User Permissions | 🛠 Planned |
| 📦 Package Management | 🛠 Planned |
| 🖥 Graphical User Interface | ⚠ Partial |
| 🌐 Networking Stack | ⚠ Partial (Has curl, but needs custom protocols and direct network access) |
| 🎗️ systemd | 🛠 Planned |
| <a href="#alternative-shells-languages-environments">**More languages, shells, environments >**</a> |

Feel free to contribute by fixing bugs, implementing new features, or suggesting improvements!

## Usage examples
### Initialization:
```js
// If you can access the ArrayBuffer of the image directly (eg. in NodeJS with the fs module) you can just provide it directly into the LinuxJS constructor, without having to use remoteImage.

// The "image" is a filesystem copy as an archive. It contains all the system files.
// Basically, think of it as a copy of a distribution.
// You can simply use the default one provided in this repo which contains all the basics, or you can create your own.
// In the future there may be some alternative ways to provide storage access, including passthrough options.

LinuxJS.remoteImage("./images/base_os.img", async image => {
  let os = await LinuxJS({ image });

  await os.boot(); // Start the boot sequence, run startup commands etc.
  // You can get system logs by doing os.std.on("out", data => ...)
})

// --- OR (Node.JS) ---

let os = await LinuxJS({
  image: fs.readFileSync("./images/base_os.img")
})

await os.boot();
```
### Running a simple process:
```js
// Run "ls -R" and log the result
os.process("ls", null, ["-R"], {  // command, pwd, arguments, options
  onstdout(data){
    console.log(data)
  }
})

// Async variant (stores stdout in a buffer, waits for exit, returns the buffer)
console.log( await os.exec("ls -R") )
```
### Attaching an interactive bash shell to a terminal emulator:
```js
// Assuming "term" is a Xterm.JS instance
// Note that thanks to LinuxJS operating with standard i/o and escape codes, the terminal emulator can be any standard terminal! Its possible to hook this up to any terminal to use as with any other environment, technically even a ssh server.

// Want a demo? Try "ssh linuxjs@extragon.cloud" with the password "LinuxJSDemo"!

let bash = os.process("bash", "~", ["-i"], {
  onstdout(data){
    term.write(data)
  },
  onstderr(data){
    term.write(data)
  },
  onexit(code){
    // ...
  }
})

term.onKey(event => {
  bash.std.in = event.key // Pushes the key into the standard input
  // alternatively: bash.std.input(event.key)
})
```

![Screenshot from 2024-08-02 22-54-49](https://github.com/user-attachments/assets/ab3e7c4c-b3f0-48f1-8f47-352d03ddc34c)
<!-- ![image](https://github.com/lukas-studio-tv/LinuxJS/assets/62482747/42f28ccf-f220-4c31-99de-b7b9eeff8250) -->

### Environment variables:
```js
// os.env contains global default environment variables, that are applied everywhere:
os.env.PATH += ":/custom/path"

// We can also get global environment variables with "env":
let variables = await os.exec("env")

// And of course, we can use export:
await os.exec("export MY_VARIABLE=value")

// To get local variables (eg. of a bash instance or any other proccess), you can use proccess.env or just "env" from within a JS program.
```
### File System:
```js
/*
  Note: the filesystem works with UNIX symlinks (relative to the vfs!).
  You can export a .zip file of any directory,
  and import a .zip file from your real filesystem to the virtual one.
*/


// Reading using the JS API is similar to Node.JS 
await os.fs.read("/bin/ls", "utf8")

// Writing files
os.fs.write("/bin/hello", "#! /bin/js \n std.out = 'hello world'")

// Checks if /bin exists and is a directory, then lists its contents
if(os.fs.exists("/bin") && os.fs.isDirectory("/bin")){
  console.log(
    os.fs.ls("/bin")
  )
}

// Path parsing is dynamic, same way as in Linux:
os.fs.exists("//bin//") // true
os.fs.exists("./bin") // true
os.fs.exists("/etc/../bin") // true
```
### Making JavaScript 'commands':
```js
// Some special "shebangs" are included by default, like "#! /bin/js" for JavaScript.

let content = `#! /bin/js

std.out.write(\`Hello \${argv[0]}!\`)

exit(0)
`;

os.fs.write("/usr/bin/example", content)

os.process("example", null, ["world"], {
  onstdout(data){
     console.log(data)
  }
})
```

# Alternative shells, languages, environments
As LinuxJS is supposed to be actually useful and be able to run real programs, our goal is to support and port as much environments as possible in the browser engine (and if its not possible, make it possible).


## Compatibility table
| Language/Framework                      | Status       |
|------------------------------|--------------|
| 🟡 JavaScript | ✔ Implemented |
| 💲 Shell Script | ⚠ Partial |
| 🔵 C++ | 🛠 Planned |
| 🟢 Node.JS | 🛠 Planned |
| 🔵 Python | 🛠 Planned (external) |
| 🟠 Rust | 💡 Maybe |
| 🔵 Go | 💡 Maybe |
| 🟣 Native binaries | 💡 Maybe |
| App frameworks | |
| 🔵 LSTV Arc | 💡 Maybe |
| 📦 GTK | 💡 Maybe |
| ⬜ LSTV Viewgate | 💡 Maybe |

- ### Shell Script:
  Shell script support is being implemented, tho is not fully done at this point.
  You can probably run some basic scripts with no issues, but a lot of dependencies may be missing.
  Currently **unsupported** features: loop, switch
  
  ```js
  os.shell("bash", `
  
  world="world"
  echo "Hello $world!"
  exit 0
  
  `)
  ```

- ### Node.JS
  Node.JS support is planned, but not implemented at yet.
  Polyfils or ports of the builtin packages are being made (/lib64/node/globals.js)
  The goal: Port fs, process, require() and all the other good stuff to work exactly like it does in Node.JS

- ### Python
  Python is not going to be built-in, but support is planned as a package you can install.
  Most probably, Skulpt will be used to support Python.
  If added, this is probably how it would work;
  ```js
  // *install python via a package manager*
  
  let content = `#! /usr/bin/env python
  import sys
  print("Hello, world!")

  sys.exit()
  `;
  
  os.fs.write("/tmp/example", content)
  
  os.process("example", "/tmp", [], {
    onstdout(data){
       console.log(data)
    }
  })
  ```

- ### Native Linux binaries
  This is currently not implemented nor planned (at this point).
  The idea is that we could attach a lightweight Linux virtual machine when a binary is launched, then sync the VM with your LinuxJS environment.
  This is of course a bit more difficult to achieve and would result in some inconsistencies, and would require to make a modified Linux build.
  (And of course, speed and efficiency is to be considered too.)

- ### Remote applications
  Through SSH, we can passthrough apps from a real Linux machine to LinuxJS.
  Here are some examples:
  ```js
  // Assuming "term" is a Xterm.JS instance
  
  let bash = os.process("ssh", null, ["<username>@<ip>", "-p", "<password>", "-r", "<command>"], {
    onstdout(data){
      term.write(data)
    },
    onstderr(data){
      term.write(data)
    },
    onexit(code){
      // ...
    }
  })
  
  term.onKey(event => {
    bash.std.in = event.key // Pushes the key into the standard input
  })
  ```

# Example software/libraries/modules

- ### "arisen" package
  The arisen package allows you to interact with GPT AI, ask it questions and let it stream an answer.
  This package registers 2 commands - "arisen" for asking a question or to run a command, and "arisen-gui" for a GUI (LSTV Viewgate window composer required).

  But it also registers a global library called "arisen":

  ```js
  let GPT = require("arisen");

  let gpt = GPT({
    api: "<your API URL>",
    key: "<your API key>"
  });
  
  gpt.ask("Hello. What is the current time?", {
      onStart(){
          console.log(" --- Starting to generate --- ")
      },
  
      onData(text){
          // Answer is streamed over a socked as tokens (in binary format) and decoded to text.
  
          console.log(text)
      },
  
      onEnd(tokenCount){
          console.log(` --- Finished! Consumed output tokens: ${tokenCount} --- `)
      },
  
      onError(error){
          console.error(error)
      }
  })
  ```

  - ### "wallpapers" package
  This is just a simple package that contains the default wallpapers from LiDE.
  If using a compatible desktop, they should automatically appear in your settings for you to apply.
  
  - ### "electron-supply" package
  A library that attempts to provide various tools to make porting Electron desktop applications. This is in very early stage and most apps will probably be broken.
  Node.JS emulation package is required.

  - ### "arc" package
  A port of LSTV Arc launcher to the web. Requires "electron-supply". Most apps are broken at this point. Also requires Viewgate.

  - ### "viewgate-window-manager" package
  A simple "window manager" and "compositor" using the LS framework to run on the web to simulate windows. Currently in early stage of development. Allows DOM, canvas, webGL and other as the window contents.
  Fetures some cool events, methods, and builtin attributes.

  **You do NOT need this if you are using FOSSHome, it is already built-in.** Installing this in FOSSHome will override the builtin behavior, this allows customization but is not recommended. Tho it is fairly simple to change between managers.
