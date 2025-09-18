import { Ajv } from "ajv"
import type { JSONSchemaType } from "ajv"

export interface ServerSettings {
  cookieSecret: string;
}


export const schema: JSONSchemaType<ServerSettings> = {
    "type": "object",
    "properties": {
        "cookieSecret": {
            "type": "string"
        }
    },
    "required": [
        "cookieSecret"
    ],
    "additionalProperties": false
}

const ajv = new Ajv()
export const validate = ajv.compile(schema)
//export const serialize = ajv.compileSerializer(schema)
//export const parse = ajv.compileParser(schema)
