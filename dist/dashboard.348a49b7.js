// modules are defined as an array
// [ module function, map of requires ]
//
// map of requires is short require name -> numeric require
//
// anything defined in a previous bundle is accessed via the
// orig method which is the require for previous bundles

(function (
  modules,
  entry,
  mainEntry,
  parcelRequireName,
  externals,
  distDir,
  publicUrl,
  devServer
) {
  /* eslint-disable no-undef */
  var globalObject =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof self !== 'undefined'
      ? self
      : typeof window !== 'undefined'
      ? window
      : typeof global !== 'undefined'
      ? global
      : {};
  /* eslint-enable no-undef */

  // Save the require from previous bundle to this closure if any
  var previousRequire =
    typeof globalObject[parcelRequireName] === 'function' &&
    globalObject[parcelRequireName];

  var importMap = previousRequire.i || {};
  var cache = previousRequire.cache || {};
  // Do not use `require` to prevent Webpack from trying to bundle this call
  var nodeRequire =
    typeof module !== 'undefined' &&
    typeof module.require === 'function' &&
    module.require.bind(module);

  function newRequire(name, jumped) {
    if (!cache[name]) {
      if (!modules[name]) {
        if (externals[name]) {
          return externals[name];
        }
        // if we cannot find the module within our internal map or
        // cache jump to the current global require ie. the last bundle
        // that was added to the page.
        var currentRequire =
          typeof globalObject[parcelRequireName] === 'function' &&
          globalObject[parcelRequireName];
        if (!jumped && currentRequire) {
          return currentRequire(name, true);
        }

        // If there are other bundles on this page the require from the
        // previous one is saved to 'previousRequire'. Repeat this as
        // many times as there are bundles until the module is found or
        // we exhaust the require chain.
        if (previousRequire) {
          return previousRequire(name, true);
        }

        // Try the node require function if it exists.
        if (nodeRequire && typeof name === 'string') {
          return nodeRequire(name);
        }

        var err = new Error("Cannot find module '" + name + "'");
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      }

      localRequire.resolve = resolve;
      localRequire.cache = {};

      var module = (cache[name] = new newRequire.Module(name));

      modules[name][0].call(
        module.exports,
        localRequire,
        module,
        module.exports,
        globalObject
      );
    }

    return cache[name].exports;

    function localRequire(x) {
      var res = localRequire.resolve(x);
      if (res === false) {
        return {};
      }
      // Synthesize a module to follow re-exports.
      if (Array.isArray(res)) {
        var m = {__esModule: true};
        res.forEach(function (v) {
          var key = v[0];
          var id = v[1];
          var exp = v[2] || v[0];
          var x = newRequire(id);
          if (key === '*') {
            Object.keys(x).forEach(function (key) {
              if (
                key === 'default' ||
                key === '__esModule' ||
                Object.prototype.hasOwnProperty.call(m, key)
              ) {
                return;
              }

              Object.defineProperty(m, key, {
                enumerable: true,
                get: function () {
                  return x[key];
                },
              });
            });
          } else if (exp === '*') {
            Object.defineProperty(m, key, {
              enumerable: true,
              value: x,
            });
          } else {
            Object.defineProperty(m, key, {
              enumerable: true,
              get: function () {
                if (exp === 'default') {
                  return x.__esModule ? x.default : x;
                }
                return x[exp];
              },
            });
          }
        });
        return m;
      }
      return newRequire(res);
    }

    function resolve(x) {
      var id = modules[name][1][x];
      return id != null ? id : x;
    }
  }

  function Module(moduleName) {
    this.id = moduleName;
    this.bundle = newRequire;
    this.require = nodeRequire;
    this.exports = {};
  }

  newRequire.isParcelRequire = true;
  newRequire.Module = Module;
  newRequire.modules = modules;
  newRequire.cache = cache;
  newRequire.parent = previousRequire;
  newRequire.distDir = distDir;
  newRequire.publicUrl = publicUrl;
  newRequire.devServer = devServer;
  newRequire.i = importMap;
  newRequire.register = function (id, exports) {
    modules[id] = [
      function (require, module) {
        module.exports = exports;
      },
      {},
    ];
  };

  // Only insert newRequire.load when it is actually used.
  // The code in this file is linted against ES5, so dynamic import is not allowed.
  // INSERT_LOAD_HERE

  Object.defineProperty(newRequire, 'root', {
    get: function () {
      return globalObject[parcelRequireName];
    },
  });

  globalObject[parcelRequireName] = newRequire;

  for (var i = 0; i < entry.length; i++) {
    newRequire(entry[i]);
  }

  if (mainEntry) {
    // Expose entry point to Node, AMD or browser globals
    // Based on https://github.com/ForbesLindesay/umd/blob/master/template.js
    var mainExports = newRequire(mainEntry);

    // CommonJS
    if (typeof exports === 'object' && typeof module !== 'undefined') {
      module.exports = mainExports;

      // RequireJS
    } else if (typeof define === 'function' && define.amd) {
      define(function () {
        return mainExports;
      });
    }
  }
})({"iii6l":[function(require,module,exports,__globalThis) {
function isTag(e, tag) {
    if (!(e instanceof HTMLElement)) return false;
    return e.tagName.toLowerCase() === tag;
}
function zip(a, b) {
    if (a.length === 0 || b.length === 0) return [];
    return [
        [
            a.pop(),
            b.pop()
        ],
        ...zip(a, b)
    ];
}
// from https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
async function sha256(data) {
    const msgUint8 = new TextEncoder().encode(data);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b)=>b.toString(16).padStart(2, "0")).join("");
    return hashHex;
}
class TranslationTable extends HTMLElement {
    constructor(){
        super(), this.initialized = false, this.languages = [];
    }
    static get observedAttributes() {
        return [
            "project-name"
        ];
    }
    connectedCallback() {
        if (this.initialized) return;
        this.initialized = true;
        setTimeout(this.foo.bind(this), 0);
    }
    async foo() {
        const table = this.children[0];
        if (!isTag(table, "table")) throw new Error("Unexpected");
        console.log(this.children);
        // We expect there to be at least on child element, which is the
        // table header containing the languages.
        if (table.children.length === 0) throw new Error("Unexpected");
        // We expect it to contain a <thead> and a <tbody>
        const [thead, tbody] = table.children;
        if (!isTag(thead, "thead") || !isTag(tbody, "tbody")) throw new Error("Unexpected");
        // The thead should have on <tr> child
        if (thead.children.length !== 1 || !isTag(thead.children[0], "tr")) throw new Error("Unexpected");
        const header = thead.children[0];
        const entries = tbody.children;
        // Parse the header containing the languages
        if (!isTag(header, "tr")) throw new Error("Unexpected");
        if (header.children.length === 0) throw new Error("Unexpected");
        for (const e of header.children){
            if (!isTag(e, "th")) throw new Error("Unexpected");
            this.languages.push(e.innerHTML);
        }
        // Parse the body.
        for (const row of entries){
            if (!isTag(row, "tr")) throw new Error("Unexpected");
            if (![
                ...row.children
            ].every((e)=>isTag(e, "td"))) throw new Error("Unexpected");
            const rowElements = [
                ...row.children
            ];
            if (row.children.length !== this.languages.length) throw new Error("Unexpected");
            // rowElements is non-empty because
            //   row.children.length === this.languages.length
            // and we checked above that header.children.length !== 0
            // and so this.languages.length !== 0
            const phrase = rowElements[0].innerText;
            const hash = await sha256(phrase);
            row.id = hash;
            for (const [e, language] of zip(rowElements.slice(1), this.languages.slice(1))){
                const input = document.createElement("input");
                input.setAttribute("type", "text");
                input.value = e.innerText;
                e.replaceChildren(input);
                input.addEventListener("change", ()=>{
                    // TODO this is hardcoded
                    fetch(`/translation/${this.getAttribute("project-name")}/${language}/${hash}/`, {
                        method: "POST",
                        body: input.value,
                        headers: {
                            "Content-Type": "text/plain"
                        }
                    });
                });
            }
        }
    }
}
customElements.define("translation-table", TranslationTable);

},{}]},["iii6l"], "iii6l", "parcelRequire94c2", {})

//# sourceMappingURL=dashboard.348a49b7.js.map
