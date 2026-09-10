import { z } from "zod";
import type { IWorkflow } from "./types";
export declare const nodeSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    type: z.ZodString;
    typeVersion: z.ZodDefault<z.ZodNumber>;
    position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id?: string | null | undefined;
    }, {
        name: string;
        id?: string | null | undefined;
    }>>>;
    disabled: z.ZodOptional<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    type: z.ZodString;
    typeVersion: z.ZodDefault<z.ZodNumber>;
    position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id?: string | null | undefined;
    }, {
        name: string;
        id?: string | null | undefined;
    }>>>;
    disabled: z.ZodOptional<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    type: z.ZodString;
    typeVersion: z.ZodDefault<z.ZodNumber>;
    position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id?: string | null | undefined;
    }, {
        name: string;
        id?: string | null | undefined;
    }>>>;
    disabled: z.ZodOptional<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const connectionsSchema: z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodNullable<z.ZodArray<z.ZodObject<{
    node: z.ZodString;
    type: z.ZodDefault<z.ZodString>;
    index: z.ZodDefault<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    node: z.ZodString;
    type: z.ZodDefault<z.ZodString>;
    index: z.ZodDefault<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    node: z.ZodString;
    type: z.ZodDefault<z.ZodString>;
    index: z.ZodDefault<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>, "many">>, "many">>>;
export declare const workflowSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    name: z.ZodDefault<z.ZodString>;
    active: z.ZodDefault<z.ZodBoolean>;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        typeVersion: z.ZodDefault<z.ZodNumber>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id?: string | null | undefined;
        }, {
            name: string;
            id?: string | null | undefined;
        }>>>;
        disabled: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        typeVersion: z.ZodDefault<z.ZodNumber>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id?: string | null | undefined;
        }, {
            name: string;
            id?: string | null | undefined;
        }>>>;
        disabled: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        typeVersion: z.ZodDefault<z.ZodNumber>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id?: string | null | undefined;
        }, {
            name: string;
            id?: string | null | undefined;
        }>>>;
        disabled: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>, "many">;
    connections: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodNullable<z.ZodArray<z.ZodObject<{
        node: z.ZodString;
        type: z.ZodDefault<z.ZodString>;
        index: z.ZodDefault<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        node: z.ZodString;
        type: z.ZodDefault<z.ZodString>;
        index: z.ZodDefault<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        node: z.ZodString;
        type: z.ZodDefault<z.ZodString>;
        index: z.ZodDefault<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>, "many">>, "many">>>>;
    settings: z.ZodEffects<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>, Record<string, unknown>, unknown>;
    pinData: z.ZodEffects<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>>, Record<string, Record<string, unknown>[]> | undefined, unknown>;
    tags: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
        name: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        name: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        name: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>]>, "many">>, (string | z.objectOutputType<{
        name: z.ZodString;
    }, z.ZodTypeAny, "passthrough">)[] | undefined, unknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    name: z.ZodDefault<z.ZodString>;
    active: z.ZodDefault<z.ZodBoolean>;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        typeVersion: z.ZodDefault<z.ZodNumber>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id?: string | null | undefined;
        }, {
            name: string;
            id?: string | null | undefined;
        }>>>;
        disabled: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        typeVersion: z.ZodDefault<z.ZodNumber>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id?: string | null | undefined;
        }, {
            name: string;
            id?: string | null | undefined;
        }>>>;
        disabled: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        typeVersion: z.ZodDefault<z.ZodNumber>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id?: string | null | undefined;
        }, {
            name: string;
            id?: string | null | undefined;
        }>>>;
        disabled: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>, "many">;
    connections: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodNullable<z.ZodArray<z.ZodObject<{
        node: z.ZodString;
        type: z.ZodDefault<z.ZodString>;
        index: z.ZodDefault<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        node: z.ZodString;
        type: z.ZodDefault<z.ZodString>;
        index: z.ZodDefault<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        node: z.ZodString;
        type: z.ZodDefault<z.ZodString>;
        index: z.ZodDefault<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>, "many">>, "many">>>>;
    settings: z.ZodEffects<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>, Record<string, unknown>, unknown>;
    pinData: z.ZodEffects<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>>, Record<string, Record<string, unknown>[]> | undefined, unknown>;
    tags: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
        name: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        name: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        name: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>]>, "many">>, (string | z.objectOutputType<{
        name: z.ZodString;
    }, z.ZodTypeAny, "passthrough">)[] | undefined, unknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    name: z.ZodDefault<z.ZodString>;
    active: z.ZodDefault<z.ZodBoolean>;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        typeVersion: z.ZodDefault<z.ZodNumber>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id?: string | null | undefined;
        }, {
            name: string;
            id?: string | null | undefined;
        }>>>;
        disabled: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        typeVersion: z.ZodDefault<z.ZodNumber>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id?: string | null | undefined;
        }, {
            name: string;
            id?: string | null | undefined;
        }>>>;
        disabled: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        typeVersion: z.ZodDefault<z.ZodNumber>;
        position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id?: string | null | undefined;
        }, {
            name: string;
            id?: string | null | undefined;
        }>>>;
        disabled: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>, "many">;
    connections: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodNullable<z.ZodArray<z.ZodObject<{
        node: z.ZodString;
        type: z.ZodDefault<z.ZodString>;
        index: z.ZodDefault<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        node: z.ZodString;
        type: z.ZodDefault<z.ZodString>;
        index: z.ZodDefault<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        node: z.ZodString;
        type: z.ZodDefault<z.ZodString>;
        index: z.ZodDefault<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>, "many">>, "many">>>>;
    settings: z.ZodEffects<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>, Record<string, unknown>, unknown>;
    pinData: z.ZodEffects<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>>, Record<string, Record<string, unknown>[]> | undefined, unknown>;
    tags: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
        name: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        name: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        name: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>]>, "many">>, (string | z.objectOutputType<{
        name: z.ZodString;
    }, z.ZodTypeAny, "passthrough">)[] | undefined, unknown>;
}, z.ZodTypeAny, "passthrough">>;
export type ParsedWorkflow = z.infer<typeof workflowSchema>;
export interface ParseResult {
    ok: boolean;
    workflow?: IWorkflow;
    error?: string;
}
export declare function newId(prefix?: string): string;
/**
 * Normalize common export wrappers into a top-level workflow object.
 *
 * Accepts:
 * - Standard n8n/OpenFlow export: `{ nodes, connections, name, ... }`
 * - Template API wrapper: `{ id, name, workflow: { nodes, connections, ... } }`
 * - Nested template meta: `{ workflow: { workflow: { nodes, ... }, name, ... } }`
 */
export declare function unwrapWorkflowPayload(raw: unknown): unknown;
/** Parse raw JSON text (or object) into our workflow model. */
export declare function parseWorkflowJson(input: string | unknown, fallbackId?: string): ParseResult;
export type WorkflowExportMode = "openflow" | "n8n";
/** Rewrite node types for a given export mode (does not mutate input). */
export declare function mapWorkflowTypes(workflow: IWorkflow, mode: WorkflowExportMode): IWorkflow;
/** Serialise back to JSON. Default mode is OpenFlow-native type ids. */
export declare function serializeWorkflow(workflow: IWorkflow, options?: {
    mode?: WorkflowExportMode;
}): string;
