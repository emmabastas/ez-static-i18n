import Ajv from "ajv"
import type { JSONSchemaType } from "ajv"

export interface Package {
  [k: string]: unknown;
}


export const schema: JSONSchemaType<Package> = {
    "type": "module",
    "scripts": {
        "start": "concurrently --kill-others \"npm run components:dev\" \"node --experimental-strip-types src/main.ts\"",
        "components:dev": "tsc --watch --project ./components",
        "schemas:compile": "node --experimental-strip-types ./schemas/compile.ts"
    },
    "dependencies": {
        "@types/bcrypt": "^6.0.0",
        "@types/body-parser": "^1.19.6",
        "@types/express": "github:types/npm-express",
        "@types/express-session": "^1.18.2",
        "ajv": "^8.17.1",
        "bcrypt": "^6.0.0",
        "body-parser": "^2.2.0",
        "concurrently": "^9.2.1",
        "express": "^5.1.0",
        "express-handlebars": "^8.0.3",
        "express-session": "^1.18.2",
        "node-html-parser": "^7.0.1"
    },
    "devDependencies": {
        "json-schema-to-typescript": "^15.0.4"
    }
}

const ajv = new Ajv()
export const validate = ajv.compile(schema)
//export const serialize = ajv.compileSerializer(schema)
//export const parse = ajv.compileParser(schema)
