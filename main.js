'use strict';
const path = require('path');
const fs = require('fs');
const exec = require('child_process').exec;
/**
 * The PolyMd module is a command line module to create polymer elements from a template.
 * It contains full directory structure with the helper files like .gitignore or .hintrc
 *
 * # Usage
 * polymd module-name [--description "the description"]
 *
 * Where `module-name` is a name of the web component.
 */
class PolyMd {

  constructor(name, options) {
    if (!name) {
      this.throwError('invalid-name', name);
      return;
    }
    if (/[a-zA-Z0-9\-]/.test(name) || name.indexOf('-') === -1) {
      name = name.toLowerCase();
      this.name = name;
    } else {
      this.throwError('invalid-name', name);
      return;
    }

    this.processArgs(options);
  }

  get author() {
    if (this.isArc) {
      return 'The Advanced REST client authors <arc@mulesoft.com>';
    }
    return this._author || process.env.POLYMD_AUTHOR || process.env.USER || 'Add author here';
  }

  get repository() {
    if (this.isArc) {
      return `advanced-rest-client/${this.name}`;
    }
    if (this._repository) {
      return this._repository + '/' + this.name;
    }
    if (process.env.POLYMD_REPO) {
      return process.env.POLYMD_REPO + this.name;
    }
    return 'YOUR-NAME/' + this.name;
  }

  processArgs(o) {
    if (o.description) {
      this.description = o.description;
    }
    if (o.author) {
      this._author = o.author;
    }
    if (o.version) {
      this.version = o.version;
    }
    if (o.repository) {
      this._repository = o.repository;
    }
    if (o.path) {
      this.target = o.path;
    } else {
      this.setTarget();
    }
    if (o.arc) {
      this.isArc = true;
    }
    if (!o.tests) {
      this.skipTest = true;
    }
    if (!o.demo) {
      this.skipDemo = true;
    }
    if (!o.deps) {
      this.skipDeps = true;
    }
    if (!o.travis) {
      this.skipTravis = true;
    }
  }

  throwError(type, param) {
    var message = '';

    switch (type) {
      case 'invalid-name':
        message += 'The name of the component is invalid: ' + param + '. \n';
        message += 'Only A-Z, a-z, 0-9 and `-` signs are allowed. The name must contain ';
        message += 'a `-` sign.';
      break;
    }

    throw new Error(message);
  }

  // Set target directory
  setTarget() {
    var dir = process.cwd();
    dir += '/' + this.name;
    this.target = dir;
  }

  selfPath(path) {
    return __dirname + '/' + path;
  }

  run() {
    if (!this.target) {
      throw new Error('Unknown target. Set argument first.');
    }
    var ignore = [];
    if (this.skipTravis) {
      ignore[ignore.length] = '.travis.yml';
    }
    // Copy helper files.
    this.copy(this.selfPath('templates/helpers'), path.join(this.target, './'), ignore);
    // Component's metadata and logic.
    this.copy(this.selfPath('templates/logic'), path.join(this.target, './'));
    this.copy(this.selfPath('templates/_package.json'), path.join(this.target, './package.json'));
    // Gulp tasks.
    this.copy(this.selfPath('templates/tasks'), path.join(this.target, './tasks'));
    // The Component
    this.copy(this.selfPath('templates/component.html'),
      path.join(this.target, `./${this.name}.html`));
    // Test cases.
    if (!this.skipTest) {
      this.copy(this.selfPath('templates/test'), path.join(this.target, './test'));
    }
    // Demo page.
    if (!this.skipDemo) {
      this.copy(this.selfPath('templates/demo'), path.join(this.target, './demo'));
    }
    if (this.isArc) {
      this.copy(this.selfPath('templates/license-file-arc.md'),
        path.join(this.target, './LICENSE.md'));
    }
    this.updateVariables();
    return this.deps().then(() => this._printEnd()).catch(() => {
      console.log('Unable to install dependencies.');
      console.log('Run: \'npm run deps\' manually.');
      this._printEnd();
    });
  }

  _printEnd() {
    console.log('');
    console.log('  All set. You can now start development.');
    console.log('  Try npm run serve to see the component\'s documentation.');
    console.log('');
  }
  /**
   * Copy file from one location to another. It can be either file or directory.
   * If it's directory then it copy files only to the `dest` location without the folder.
   *
   * @param {String} src A source file or directory. The directory won't be copied - only
   * its content
   * @param {String} dest A plece where to move files
   * @param {Array<String>?} exclude Files to ignore during copy.
   */
  copy(src, dest, exclude) {
    exclude = exclude || [];
    var stats;
    try {
      stats = fs.statSync(src);
    } catch (e) {
      return false;
    }

    if (stats.isFile()) {
      try {
        let ds = fs.statSync(dest);
        if (ds.isDirectory()) {
          console.log('Will not copy directory...');
          return;
        } else if (ds.isFile()) {
          fs.unlinkSync(dest);
        }
      } catch (e) {

      }
      console.log('  Writing file ' + dest);
      fs.writeFileSync(dest, fs.readFileSync(src));
      return true;
    } else if (stats.isDirectory()) {
      try {
        fs.mkdirSync(dest);
      } catch (e) {

      }
      fs.readdirSync(src).forEach((file) => {
        if (exclude.indexOf(file) !== -1) {
          console.log('Dropping file ' + file + ' as ignored.');
          return;
        }
        this.copy(path.join(src, file),
                        path.join(dest, file));
      });
    }
  }

  // Update variables in the copied files.
  updateVariables() {
    this._updateVars(path.join(this.target, './bower.json'));
    this._updateVars(path.join(this.target, './package.json'));
    this._updateVars(path.join(this.target, './README.md'));
    this._updateVars(path.join(this.target, `./${this.name}.html`));
    this._updateVars(path.join(this.target, './index.html'));
    this._updateVars(path.join(this.target, './.travis.yml'));
    // Test file.
    if (!this.skipTest) {
      this._updateVars(path.join(this.target, './test/basic-test.html'));
    }
    // Demo page.
    if (!this.skipDemo) {
      this._updateVars(path.join(this.target, './demo/index.html'));
    }
    if (this.isArc) {
      let pkg = JSON.parse(fs.readFileSync(path.join(this.target, './package.json'), 'utf8'));
      pkg.license += ' OR CC-BY-4.0';
      pkg.bugs.email = 'arc@mulesoft.com';
      fs.writeFileSync(path.join(this.target, './package.json'), JSON.stringify(pkg, null, 2));

      let bower = JSON.parse(fs.readFileSync(path.join(this.target, './bower.json'), 'utf8'));
      bower.license += ' OR CC-BY-4.0';
      fs.writeFileSync(path.join(this.target, './bower.json'), JSON.stringify(bower, null, 2));
    }
  }

  _updateVars(file) {
    var name = this.name;
    var author = this.author;
    var description = this.description || 'Insert description here.';
    var version = this.version || '0.0.1';
    var repository = this.repository;

    var txt = fs.readFileSync(file, 'utf8');
    txt = txt.replace(/ELEMENT-NAME/gim, name);
    txt = txt.replace(/ELEMENT-AUTHOR/gim, author);
    txt = txt.replace(/ELEMENT-DESCRIPTION/gim, description);
    txt = txt.replace(/ELEMENT-VERSION/gim, version);
    txt = txt.replace(/REPOSITORY-NAME/gim, repository);
    fs.writeFileSync(file, txt);
  }

  deps() {
    if (this.skipDeps) {
      return Promise.resolve();
    }
    console.log('Installing dependencies...');
    return this.exec('npm run deps', this.target);
  }
  /**
   * Execute shell command
   *
   * @param {String} cmd Command to execute
   * @param {String?} dir A directoy where to execute the command.
   * @return {Promise} Promise resolves itself if the command was executed successfully and
   * rejects it there was an error.
   */
  exec(cmd, dir) {
    dir = dir || undefined;
    return new Promise((resolve, reject) => {
      var opts = {};
      if (dir) {
        opts.cwd = dir;
      }
      exec(cmd, opts, (err, stdout, stderr) => {
        if (err) {
          let currentDir = process.cwd();
          if (opts.cwd) {
            currentDir = opts.cwd;
          }
          reject(new Error('Unable to execute command: ' + err.message +
            '. Was in dir: ' + currentDir + '. stdout: ', stdout, '. stderr: ', stderr));
          return;
        }
        resolve(stdout);
      });
    });
  }
}
exports.PolyMd = PolyMd;
