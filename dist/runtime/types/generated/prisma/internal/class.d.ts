import * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "./prismaNamespace.ts";
export type LogOptions<ClientOptions extends Prisma.PrismaClientOptions> = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never;
export interface PrismaClientConstructor {
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
    new <Options extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions, LogOpts extends LogOptions<Options> = LogOptions<Options>, OmitOpts extends Prisma.PrismaClientOptions['omit'] = Options extends {
        omit: infer U;
    } ? U : Prisma.PrismaClientOptions['omit'], ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs>(options: Prisma.PrismaClientConstructorArgs<Options>): PrismaClient<LogOpts, OmitOpts, ExtArgs>;
}
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
export interface PrismaClient<in LogOpts extends Prisma.LogLevel = never, in out OmitOpts extends Prisma.PrismaClientOptions['omit'] = Prisma.PrismaClientOptions['omit'], in out ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['other'];
    };
    $on<V extends LogOpts>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;
    /**
     * Connect with the database
     */
    $connect(): runtime.Types.Utils.JsPromise<void>;
    /**
     * Disconnect from the database
     */
    $disconnect(): runtime.Types.Utils.JsPromise<void>;
    /**
       * Executes a prepared raw query and returns the number of affected rows.
       * @example
       * ```
       * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
       * ```
       *
       * Read more in our [docs](https://pris.ly/d/raw-queries).
       */
    $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;
    /**
     * Executes a raw query and returns the number of affected rows.
     * Susceptible to SQL injections, see documentation.
     * @example
     * ```
     * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
     * ```
     *
     * Read more in our [docs](https://pris.ly/d/raw-queries).
     */
    $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;
    /**
     * Performs a prepared raw query and returns the `SELECT` data.
     * @example
     * ```
     * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
     * ```
     *
     * Read more in our [docs](https://pris.ly/d/raw-queries).
     */
    $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;
    /**
     * Performs a raw query and returns the `SELECT` data.
     * Susceptible to SQL injections, see documentation.
     * @example
     * ```
     * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
     * ```
     *
     * Read more in our [docs](https://pris.ly/d/raw-queries).
     */
    $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;
    /**
     * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
     * @example
     * ```
     * const [george, bob, alice] = await prisma.$transaction([
     *   prisma.user.create({ data: { name: 'George' } }),
     *   prisma.user.create({ data: { name: 'Bob' } }),
     *   prisma.user.create({ data: { name: 'Alice' } }),
     * ])
     * ```
     *
     * Read more in our [docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
     */
    $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
    }): runtime.Types.Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>;
    $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => runtime.Types.Utils.JsPromise<R>, options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
    }): runtime.Types.Utils.JsPromise<R>;
    $extends: runtime.Types.Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<OmitOpts>, ExtArgs, runtime.Types.Utils.Call<Prisma.TypeMapCb<OmitOpts>, {
        extArgs: ExtArgs;
    }>>;
    /**
 * `prisma.user`: Exposes CRUD operations for the **User** model.
  * Example usage:
  * ```ts
  * // Fetch zero or more Users
  * const users = await prisma.user.findMany()
  * ```
  */
    get user(): Prisma.UserDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.project`: Exposes CRUD operations for the **Project** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Projects
      * const projects = await prisma.project.findMany()
      * ```
      */
    get project(): Prisma.ProjectDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.environment`: Exposes CRUD operations for the **Environment** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Environments
      * const environments = await prisma.environment.findMany()
      * ```
      */
    get environment(): Prisma.EnvironmentDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.variable`: Exposes CRUD operations for the **Variable** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Variables
      * const variables = await prisma.variable.findMany()
      * ```
      */
    get variable(): Prisma.VariableDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.share`: Exposes CRUD operations for the **Share** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Shares
      * const shares = await prisma.share.findMany()
      * ```
      */
    get share(): Prisma.ShareDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.projectMember`: Exposes CRUD operations for the **ProjectMember** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more ProjectMembers
      * const projectMembers = await prisma.projectMember.findMany()
      * ```
      */
    get projectMember(): Prisma.ProjectMemberDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.session`: Exposes CRUD operations for the **Session** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Sessions
      * const sessions = await prisma.session.findMany()
      * ```
      */
    get session(): Prisma.SessionDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.workflow`: Exposes CRUD operations for the **Workflow** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Workflows
      * const workflows = await prisma.workflow.findMany()
      * ```
      */
    get workflow(): Prisma.WorkflowDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.formRoute`: Exposes CRUD operations for the **FormRoute** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more FormRoutes
      * const formRoutes = await prisma.formRoute.findMany()
      * ```
      */
    get formRoute(): Prisma.FormRouteDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.execution`: Exposes CRUD operations for the **Execution** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Executions
      * const executions = await prisma.execution.findMany()
      * ```
      */
    get execution(): Prisma.ExecutionDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.secretProvider`: Exposes CRUD operations for the **SecretProvider** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more SecretProviders
      * const secretProviders = await prisma.secretProvider.findMany()
      * ```
      */
    get secretProvider(): Prisma.SecretProviderDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.credential`: Exposes CRUD operations for the **Credential** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Credentials
      * const credentials = await prisma.credential.findMany()
      * ```
      */
    get credential(): Prisma.CredentialDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.apiKey`: Exposes CRUD operations for the **ApiKey** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more ApiKeys
      * const apiKeys = await prisma.apiKey.findMany()
      * ```
      */
    get apiKey(): Prisma.ApiKeyDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.webhookRoute`: Exposes CRUD operations for the **WebhookRoute** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more WebhookRoutes
      * const webhookRoutes = await prisma.webhookRoute.findMany()
      * ```
      */
    get webhookRoute(): Prisma.WebhookRouteDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.scheduledTrigger`: Exposes CRUD operations for the **ScheduledTrigger** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more ScheduledTriggers
      * const scheduledTriggers = await prisma.scheduledTrigger.findMany()
      * ```
      */
    get scheduledTrigger(): Prisma.ScheduledTriggerDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.dataTable`: Exposes CRUD operations for the **DataTable** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more DataTables
      * const dataTables = await prisma.dataTable.findMany()
      * ```
      */
    get dataTable(): Prisma.DataTableDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.dataTableRow`: Exposes CRUD operations for the **DataTableRow** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more DataTableRows
      * const dataTableRows = await prisma.dataTableRow.findMany()
      * ```
      */
    get dataTableRow(): Prisma.DataTableRowDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.workflowTemplate`: Exposes CRUD operations for the **WorkflowTemplate** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more WorkflowTemplates
      * const workflowTemplates = await prisma.workflowTemplate.findMany()
      * ```
      */
    get workflowTemplate(): Prisma.WorkflowTemplateDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
}
export declare function getPrismaClientClass(): PrismaClientConstructor;
