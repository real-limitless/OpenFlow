import { z } from "zod";

const grantSchema = z.object({
  workflowId: z.string().trim().min(1).max(200),
  canRead: z.boolean().optional(),
  canWrite: z.boolean().optional(),
  canExecute: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
});

const scopeSchema = z.array(z.string().trim().min(1).max(80)).max(20);

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  scopes: scopeSchema.optional(),
  restrictWorkflows: z.boolean().optional(),
  canCreateWorkflows: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
  ownerEmail: z.string().trim().email("Invalid owner email").max(320).optional(),
  ownerName: z.string().trim().max(200).optional(),
  grants: z.array(grantSchema).max(200).optional(),
});

export const patchApiKeyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    scopes: scopeSchema.optional(),
    restrictWorkflows: z.boolean().optional(),
    canCreateWorkflows: z.boolean().optional(),
    expiresAt: z.string().nullable().optional(),
    ownerEmail: z.string().trim().email("Invalid owner email").max(320).optional(),
    ownerName: z.string().trim().max(200).optional(),
    grants: z.array(grantSchema).max(200).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "no changes" });

export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
export type PatchApiKeyBody = z.infer<typeof patchApiKeyBodySchema>;
