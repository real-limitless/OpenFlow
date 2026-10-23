import { z } from "zod";

export const loginBodySchema = z.object({
  email: z.string().trim().email("Invalid email format").max(320),
  password: z.string().min(1, "Email and password are required").max(1024),
});

export const registerBodySchema = z.object({
  email: z.string().trim().email("Invalid email format").max(320),
  password: z.string().min(8, "Password must be at least 8 characters").max(1024),
  inviteToken: z.string().trim().min(1).max(512).optional(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
