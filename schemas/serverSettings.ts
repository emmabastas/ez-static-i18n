import { Ajv } from "ajv"
import type { JSONSchemaType } from "ajv"

export interface ServerSettings {
  cookieSecret: string;
  redis: {
    url: string;
  };
}


export const schema: JSONSchemaType<ServerSettings> = {
    "type": "object",
    "properties": {
        "cookieSecret": {
            "type": "string"
        },
        "redis": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string"
                }
            },
            "required": [
                "url"
            ],
            "additionalProperties": false
        }
    },
    "required": [
        "cookieSecret",
        "redis"
    ],
    "additionalProperties": false
}

const ajv = new Ajv()
export const validate = ajv.compile(schema)
//export const serialize = ajv.compileSerializer(schema)
//export const parse = ajv.compileParser(schema)
