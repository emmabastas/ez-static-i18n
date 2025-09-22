import type { JSONSchemaType } from "ajv";
export interface ServerSettings {
    port: number;
    sqlitePath: string;
    cookieSecret: string;
    redis: {
        url: string;
    };
}
export declare const schema: JSONSchemaType<ServerSettings>;
export declare const validate: import("ajv").ValidateFunction<ServerSettings>;
