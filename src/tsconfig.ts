import Ajv from "ajv"
import type { JSONSchemaType } from "ajv"

export interface Tsconfig {
  [k: string]: unknown;
}


export const schema: JSONSchemaType<Tsconfig> = {
    "compilerOptions": {
        "module": "nodenext",
        "moduleResolution": "nodenext",
        "allowImportingTsExtensions": true,
        "resolvePackageJsonExports": true,
        "esModuleInterop": true,
        "isolatedModules": true,
        "declaration": true,
        "removeComments": true,
        "emitDecoratorMetadata": true,
        "experimentalDecorators": true,
        "allowSyntheticDefaultImports": true,
        "target": "ES2023",
        "sourceMap": true,
        "outDir": "../lib",
        "baseUrl": "./",
        "incremental": true,
        "skipLibCheck": true,
        "strictNullChecks": true,
        "forceConsistentCasingInFileNames": true,
        "noImplicitAny": true,
        "strictBindCallApply": true,
        "noFallthroughCasesInSwitch": true
    }
}

const ajv = new Ajv()
export const validate = ajv.compile(schema)
//export const serialize = ajv.compileSerializer(schema)
//export const parse = ajv.compileParser(schema)
