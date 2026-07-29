import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../generated/prisma/client";
import { config } from "../config";

const pool = new pg.Pool({ connectionString: config.database.url });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
