function isTag(e: ChildNode, tag: "table"): e is HTMLTableElement
function isTag(e: ChildNode, tag: "thead"): e is HTMLTableSectionElement
function isTag(e: ChildNode, tag: "tbody"): e is HTMLTableSectionElement
function isTag(e: ChildNode, tag: "tr"): e is HTMLTableRowElement
function isTag(e: ChildNode, tag: "th"): e is HTMLTableCellElement
function isTag(e: ChildNode, tag: "td"): e is HTMLTableCellElement
function isTag(e: ChildNode, tag: string): e is HTMLElement {
    if (! (e instanceof HTMLElement)) {
        return false
    }
    return e.tagName.toLowerCase() === tag
}

function zip<A, B>(a: A[], b: B[]): [A, B][] {
    if (a.length === 0 || b.length === 0) {
        return []
    }
    return [[a.pop()!, b.pop()!], ...zip(a, b)]
}

// from https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
async function sha256(data: string) {
  const msgUint8 = new TextEncoder().encode(data);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

class TranslationTable extends HTMLElement {
    private initialized: boolean = false
    private languages: string[] = []

    constructor() {
        super()
    }

    connectedCallback() {
        if (this.initialized) return
        this.initialized = true

        setTimeout(this.foo.bind(this), 0)
    }

    async foo() {
        const table = this.children[0]
        if (! isTag(table, "table")) {
            throw new Error("Unexpected")
        }

        console.log(this.children)

        // We expect there to be at least on child element, which is the
        // table header containing the languages.
        if (table.children.length === 0) {
            throw new Error("Unexpected")
        }

        // We expect it to contain a <thead> and a <tbody>
        const [ thead, tbody ] = table.children
        if (!isTag(thead, "thead") || !isTag(tbody, "tbody")) {
            throw new Error("Unexpected")
        }

        // The thead should have on <tr> child
        if (thead.children.length !== 1 || !isTag(thead.children[0], "tr")) {
            throw new Error("Unexpected")
        }
        const header = thead.children[0]

        const entries = tbody.children

        // Parse the header containing the languages
        if (! isTag(header, "tr")) {
            throw new Error("Unexpected")
        }
        if (header.children.length === 0) {
            throw new Error("Unexpected")
        }
        for (const e of header.children) {
            if (! isTag(e, "th")) {
                throw new Error("Unexpected")
            }
            this.languages.push(e.innerHTML)
        }

        // Parse the body.
        for (const row of entries) {
            if (! isTag(row, "tr")) {
                throw new Error("Unexpected")
            }

            if (! [...row.children].every(e => isTag(e, "td"))) {
                throw new Error("Unexpected")
            }
            const rowElements = [...row.children] as HTMLTableCaptionElement[]

            if (row.children.length !== this.languages.length) {
                throw new Error("Unexpected")
            }

            // rowElements is non-empty because
            //   row.children.length === this.languages.length
            // and we checked above that header.children.length !== 0
            // and so this.languages.length !== 0
            const phrase = rowElements[0]!.innerText
            const hash = await sha256(phrase)

            row.id = hash

            for (const [e, language] of zip(
                rowElements.slice(1),
                this.languages.slice(1),
            )) {
                const input = document.createElement("input")
                input.setAttribute("type", "text")
                input.value = e.innerText
                e.replaceChildren(input)
                input.addEventListener("change", () => {
                    fetch(`/translation/${language}/${hash}/`, {
                        method: "POST",
                        body: input.value,
                        headers: {
                            "Content-Type": "text/plain",
                        }
                    })
                })
            }
        }
    }
}

customElements.define("translation-table", TranslationTable)
