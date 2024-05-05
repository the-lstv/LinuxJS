<p align="center">
  <img src="https://d311dyy4cric87.cloudfront.net/file/c623c97932b119c5eb89ebb37c699cf2.webp" alt="LinuxJS Logo">
</p>

# LinuxJS

> ### "Imagine being able to emulate a Linux-like environment on any website, for any purpose of any scale, from just a simple, tiny library, with almost no overhead."

LinuxJS is a project that emulates an entire UNIX-like Linux environment in vanilla browser JavaScript.<br>
Its lightweight (just about 29Kb uncompressed!), fast, and licensed under the GPL 3.0 license.

---

Please note that this is not a virtual machine or any kind of hardware/bytecode emulation.<br>
The system is entirely in vanilla JavaScript - most has been rewritten, little of the code is taken from the actual kernel.<br>
Tho, also note that this is not just a "simulator" - the goal is to have a somewhat cross-compatible and functional environment, which emulates a real Linux machine as closely as possible.

---

**Current version:** 0.2.59<br>
- Interactive demo is comming soon!

## Features


| Feature                      | Status       |
|------------------------------|--------------|
| 📁 Virtual File System | ✔ Implemented |
| 📁 Advanced File System (mount, SFTP, symlinks..) | ⚠ Partial |
| 🕹️ JavaScript API | ✔ Implemented |
| 🔮 Process emulation, STDIO | ✔ Implemented |
| 💻 Compatible with terminal emulators | ✔ Implemented |
| 💻 Bash Shell | ✔ Implemented |
| 💻 Shell Script compatibility | ⚠ Partial |
| 💻 Node.JS emulation, port builtin modules | ⚠ Partial |
| 💻 PATH variable, run custom scripts, lib64, usr/bin | ✔ Implemented |
| 📝 Basic commands (ls, cd, pwd, mkdir, rm..) | ⚠ Partial (70%) |
| 📝 File Editing (touch, echo, cat, nano..) | ⚠ Partial |
| 👥 User Management, passwd | 🛠 Planned |
| 👤 User Permissions | 🛠 Planned |
| 📦 Package Management | 🛠 Planned |
| 🖥 Graphical User Interface | ⚠ Partial |
| 🌐 Networking Stack | ⚠ Partial |
| 🎗️ systemctl | 🛠 Planned |
| <a href="#alternative-shells-languages-environments">**More languages, shells, environments >**</a> |

Feel free to contribute by fixing bugs, implementing new features, or suggesting improvements!

## Usage examples
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
### Attaching an interactive bash to a terminal emulator:
```js
// Assuming "term" is a Xterm.JS instance

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
})
```
![image](https://github.com/lukas-studio-tv/LinuxJS/assets/62482747/42f28ccf-f220-4c31-99de-b7b9eeff8250)

### Environment variables:
```js
// os.env contains global default environment variables, that are applied everywhere:
os.env.PATH += ":/custom/path"

// We can get environment variables of a specific process with "env":
let variables = await os.exec("env")

// And of course, we can use export:
await os.exec("export MY_VARIABLE=value")
```
### File System:
```js
/*
  Note: the filesystem works with UNIX symlinks (relative to the vfs!),
  and is cross-compatible - you can export a .zip file of any directory,
  and import a .zip file from your real filesystem to the virtual one.
*/


// Reading is similar to Node.JS 
await os.fs.read("/bin/ls", "utf8")

// Writing files
os.fs.write("/bin/hello", "#! /bin/js \n std.out = 'hello world'")

// Checks if /bin exists and is a directory, then lists its contents
if(os.fs.exists("/bin") && os.fs.isDirectory("/bin")){
  console.log(
    os.fs.ls("/bin")
  )
}

// Path parsing is quite dynamic:
os.fs.exists("//bin//") // true
os.fs.exists("./bin") // true
os.fs.exists("/etc/../bin") // true
```
### Making JavaScript 'commands':
```js
// Some special shebangs are included by default, like "#! /bin/js" for JavaScript.

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
| Feature                      | Status       |
|------------------------------|--------------|
| 🟡 JavaScript | ✔ Implemented |
| 💲 Shell Script | ⚠ Partial |
| 🔵 C++ | ⚠ Partial |
| 🟢 Node.JS | 🛠 Planned |
| 🔵 Python | 🛠 Planned (external) |
| 🟠 Rust | 💡 Maybe |
| 🔵 Go | 💡 Maybe |
| 🟣 Native binaries | 💡 Maybe |

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
