import * as runtime from "@prisma/client/runtime/client";
import * as $Class from "./internal/class.ts";
import * as Prisma from "./internal/prismaNamespace.ts";
export * as $Enums from './enums.ts';
export * from "./enums.ts";
/**
 * ## Prisma Client
 *
 * Type-safe database client for TypeScript
 * @example
 * ```
 * const prisma = new PrismaClient({
 *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
 * })
 * // Fetch zero or more Users
 * const users = await prisma.user.findMany()
 * ```
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export declare const PrismaClient: $Class.PrismaClientConstructor;
export type PrismaClient<LogOpts extends Prisma.LogLevel = never, OmitOpts extends Prisma.PrismaClientOptions["omit"] = Prisma.PrismaClientOptions["omit"], ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = $Class.PrismaClient<LogOpts, OmitOpts, ExtArgs>;
export { Prisma };
/**
 * Model User
 *
 */
export type User = Prisma.UserModel;
/**
 * Model Project
 *
 */
export type Project = Prisma.ProjectModel;
/**
 * Model Environment
 *
 */
export type Environment = Prisma.EnvironmentModel;
/**
 * Model Variable
 *
 */
export type Variable = Prisma.VariableModel;
/**
 * Model Share
 *
 */
export type Share = Prisma.ShareModel;
/**
 * Model ProjectMember
 *
 */
export type ProjectMember = Prisma.ProjectMemberModel;
/**
 * Model Session
 *
 */
export type Session = Prisma.SessionModel;
/**
 * Model Workflow
 *
 */
export type Workflow = Prisma.WorkflowModel;
/**
 * Model FormRoute
 *
 */
export type FormRoute = Prisma.FormRouteModel;
/**
 * Model Execution
 *
 */
export type Execution = Prisma.ExecutionModel;
/**
 * Model SecretProvider
 *
 */
export type SecretProvider = Prisma.SecretProviderModel;
/**
 * Model Credential
 *
 */
export type Credential = Prisma.CredentialModel;
/**
 * Model ApiKey
 *
 */
export type ApiKey = Prisma.ApiKeyModel;
/**
 * Model WebhookRoute
 *
 */
export type WebhookRoute = Prisma.WebhookRouteModel;
/**
 * Model ScheduledTrigger
 *
 */
export type ScheduledTrigger = Prisma.ScheduledTriggerModel;
/**
 * Model DataTable
 *
 */
export type DataTable = Prisma.DataTableModel;
/**
 * Model DataTableRow
 *
 */
export type DataTableRow = Prisma.DataTableRowModel;
/**
 * Model WorkflowTemplate
 * Community templates synced from scraped public n8n.io workflows.
 */
export type WorkflowTemplate = Prisma.WorkflowTemplateModel;
