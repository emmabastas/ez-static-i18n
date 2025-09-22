function isTag(e, tag) {
    if (!(e instanceof HTMLElement)) {
        return false;
    }
    return e.tagName.toLowerCase() === tag;
}
function zip(a, b) {
    if (a.length === 0 || b.length === 0) {
        return [];
    }
    return [[a.pop(), b.pop()], ...zip(a, b)];
}
async function sha256(data) {
    const msgUint8 = new TextEncoder().encode(data);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
}
class TranslationTable extends HTMLElement {
    initialized = false;
    languages = [];
    constructor() {
        super();
    }
    static get observedAttributes() {
        return ["project-name"];
    }
    connectedCallback() {
        if (this.initialized)
            return;
        this.initialized = true;
        setTimeout(this.foo.bind(this), 0);
    }
    async foo() {
        const table = this.children[0];
        if (!isTag(table, "table")) {
            throw new Error("Unexpected");
        }
        console.log(this.children);
        if (table.children.length === 0) {
            throw new Error("Unexpected");
        }
        const [thead, tbody] = table.children;
        if (!isTag(thead, "thead") || !isTag(tbody, "tbody")) {
            throw new Error("Unexpected");
        }
        if (thead.children.length !== 1 || !isTag(thead.children[0], "tr")) {
            throw new Error("Unexpected");
        }
        const header = thead.children[0];
        const entries = tbody.children;
        if (!isTag(header, "tr")) {
            throw new Error("Unexpected");
        }
        if (header.children.length === 0) {
            throw new Error("Unexpected");
        }
        for (const e of header.children) {
            if (!isTag(e, "th")) {
                throw new Error("Unexpected");
            }
            this.languages.push(e.innerHTML);
        }
        for (const row of entries) {
            if (!isTag(row, "tr")) {
                throw new Error("Unexpected");
            }
            if (![...row.children].every(e => isTag(e, "td"))) {
                throw new Error("Unexpected");
            }
            const rowElements = [...row.children];
            if (row.children.length !== this.languages.length) {
                throw new Error("Unexpected");
            }
            const phrase = rowElements[0].innerText;
            const hash = await sha256(phrase);
            row.id = hash;
            for (const [e, language] of zip(rowElements.slice(1), this.languages.slice(1))) {
                const input = document.createElement("input");
                input.setAttribute("type", "text");
                input.value = e.innerText;
                e.replaceChildren(input);
                input.addEventListener("change", () => {
                    fetch(`/translation/${this.getAttribute("project-name")}/${language}/${hash}/`, {
                        method: "POST",
                        body: input.value,
                        headers: {
                            "Content-Type": "text/plain",
                        }
                    });
                });
            }
        }
    }
}
customElements.define("translation-table", TranslationTable);
export {};
