import * as fs from "fs/promises"
import { compile } from 'json-schema-to-typescript'

async function main() {
    for await (const e of fs.glob("./schemas/**/*.json")) {
        const name = e.split("/").pop()!.slice(0, -5)
        const pascalCase = name.charAt(0).toUpperCase() + name.slice(1)

        const schemaStr = await fs.readFile(e, { encoding: "utf8" })
        const schema = JSON.parse(schemaStr)

        const tsInterface = await compile(schema, pascalCase, { bannerComment: "" })

        const output = `import { Ajv } from "ajv"
import type { JSONSchemaType } from "ajv"

${tsInterface}

export const schema: JSONSchemaType<${pascalCase}> = ${JSON.stringify(schema, null, 4)}

const ajv = new Ajv()
export const validate = ajv.compile(schema)
//export const serialize = ajv.compileSerializer(schema)
//export const parse = ajv.compileParser(schema)
`
        fs.writeFile(e.slice(0, -5) + ".ts", output)
    }
}

main()
