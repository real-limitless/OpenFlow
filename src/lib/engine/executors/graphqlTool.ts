import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";
import { graphqlExecutor } from "./graphql";

export const graphqlToolExecutor: NodeExecutor = graphqlExecutor;
