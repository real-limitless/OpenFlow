import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model DataTable
 *
 */
export type DataTableModel = runtime.Types.Result.DefaultSelection<Prisma.$DataTablePayload>;
export type AggregateDataTable = {
    _count: DataTableCountAggregateOutputType | null;
    _min: DataTableMinAggregateOutputType | null;
    _max: DataTableMaxAggregateOutputType | null;
};
export type DataTableMinAggregateOutputType = {
    id: string | null;
    userId: string | null;
    projectId: string | null;
    name: string | null;
    columns: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type DataTableMaxAggregateOutputType = {
    id: string | null;
    userId: string | null;
    projectId: string | null;
    name: string | null;
    columns: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type DataTableCountAggregateOutputType = {
    id: number;
    userId: number;
    projectId: number;
    name: number;
    columns: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type DataTableMinAggregateInputType = {
    id?: true;
    userId?: true;
    projectId?: true;
    name?: true;
    columns?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type DataTableMaxAggregateInputType = {
    id?: true;
    userId?: true;
    projectId?: true;
    name?: true;
    columns?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type DataTableCountAggregateInputType = {
    id?: true;
    userId?: true;
    projectId?: true;
    name?: true;
    columns?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type DataTableAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which DataTable to aggregate.
     */
    where?: Prisma.DataTableWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DataTables to fetch.
     */
    orderBy?: Prisma.DataTableOrderByWithRelationInput | Prisma.DataTableOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.DataTableWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DataTables from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DataTables.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned DataTables
    **/
    _count?: true | DataTableCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: DataTableMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: DataTableMaxAggregateInputType;
};
export type GetDataTableAggregateType<T extends DataTableAggregateArgs> = {
    [P in keyof T & keyof AggregateDataTable]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateDataTable[P]> : Prisma.GetScalarType<T[P], AggregateDataTable[P]>;
};
export type DataTableGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.DataTableWhereInput;
    orderBy?: Prisma.DataTableOrderByWithAggregationInput | Prisma.DataTableOrderByWithAggregationInput[];
    by: Prisma.DataTableScalarFieldEnum[] | Prisma.DataTableScalarFieldEnum;
    having?: Prisma.DataTableScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: DataTableCountAggregateInputType | true;
    _min?: DataTableMinAggregateInputType;
    _max?: DataTableMaxAggregateInputType;
};
export type DataTableGroupByOutputType = {
    id: string;
    userId: string;
    projectId: string;
    name: string;
    columns: string;
    createdAt: Date;
    updatedAt: Date;
    _count: DataTableCountAggregateOutputType | null;
    _min: DataTableMinAggregateOutputType | null;
    _max: DataTableMaxAggregateOutputType | null;
};
export type GetDataTableGroupByPayload<T extends DataTableGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<DataTableGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof DataTableGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], DataTableGroupByOutputType[P]> : Prisma.GetScalarType<T[P], DataTableGroupByOutputType[P]>;
}>>;
export type DataTableWhereInput = {
    AND?: Prisma.DataTableWhereInput | Prisma.DataTableWhereInput[];
    OR?: Prisma.DataTableWhereInput[];
    NOT?: Prisma.DataTableWhereInput | Prisma.DataTableWhereInput[];
    id?: Prisma.StringFilter<"DataTable"> | string;
    userId?: Prisma.StringFilter<"DataTable"> | string;
    projectId?: Prisma.StringFilter<"DataTable"> | string;
    name?: Prisma.StringFilter<"DataTable"> | string;
    columns?: Prisma.StringFilter<"DataTable"> | string;
    createdAt?: Prisma.DateTimeFilter<"DataTable"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"DataTable"> | Date | string;
    user?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
    project?: Prisma.XOR<Prisma.ProjectScalarRelationFilter, Prisma.ProjectWhereInput>;
    rows?: Prisma.DataTableRowListRelationFilter;
};
export type DataTableOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    columns?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    user?: Prisma.UserOrderByWithRelationInput;
    project?: Prisma.ProjectOrderByWithRelationInput;
    rows?: Prisma.DataTableRowOrderByRelationAggregateInput;
};
export type DataTableWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    projectId_name?: Prisma.DataTableProjectIdNameCompoundUniqueInput;
    AND?: Prisma.DataTableWhereInput | Prisma.DataTableWhereInput[];
    OR?: Prisma.DataTableWhereInput[];
    NOT?: Prisma.DataTableWhereInput | Prisma.DataTableWhereInput[];
    userId?: Prisma.StringFilter<"DataTable"> | string;
    projectId?: Prisma.StringFilter<"DataTable"> | string;
    name?: Prisma.StringFilter<"DataTable"> | string;
    columns?: Prisma.StringFilter<"DataTable"> | string;
    createdAt?: Prisma.DateTimeFilter<"DataTable"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"DataTable"> | Date | string;
    user?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
    project?: Prisma.XOR<Prisma.ProjectScalarRelationFilter, Prisma.ProjectWhereInput>;
    rows?: Prisma.DataTableRowListRelationFilter;
}, "id" | "projectId_name">;
export type DataTableOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    columns?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.DataTableCountOrderByAggregateInput;
    _max?: Prisma.DataTableMaxOrderByAggregateInput;
    _min?: Prisma.DataTableMinOrderByAggregateInput;
};
export type DataTableScalarWhereWithAggregatesInput = {
    AND?: Prisma.DataTableScalarWhereWithAggregatesInput | Prisma.DataTableScalarWhereWithAggregatesInput[];
    OR?: Prisma.DataTableScalarWhereWithAggregatesInput[];
    NOT?: Prisma.DataTableScalarWhereWithAggregatesInput | Prisma.DataTableScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"DataTable"> | string;
    userId?: Prisma.StringWithAggregatesFilter<"DataTable"> | string;
    projectId?: Prisma.StringWithAggregatesFilter<"DataTable"> | string;
    name?: Prisma.StringWithAggregatesFilter<"DataTable"> | string;
    columns?: Prisma.StringWithAggregatesFilter<"DataTable"> | string;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"DataTable"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"DataTable"> | Date | string;
};
export type DataTableCreateInput = {
    id?: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutDataTablesInput;
    project: Prisma.ProjectCreateNestedOneWithoutDataTablesInput;
    rows?: Prisma.DataTableRowCreateNestedManyWithoutTableInput;
};
export type DataTableUncheckedCreateInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    rows?: Prisma.DataTableRowUncheckedCreateNestedManyWithoutTableInput;
};
export type DataTableUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutDataTablesNestedInput;
    project?: Prisma.ProjectUpdateOneRequiredWithoutDataTablesNestedInput;
    rows?: Prisma.DataTableRowUpdateManyWithoutTableNestedInput;
};
export type DataTableUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    rows?: Prisma.DataTableRowUncheckedUpdateManyWithoutTableNestedInput;
};
export type DataTableCreateManyInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type DataTableUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableListRelationFilter = {
    every?: Prisma.DataTableWhereInput;
    some?: Prisma.DataTableWhereInput;
    none?: Prisma.DataTableWhereInput;
};
export type DataTableOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type DataTableProjectIdNameCompoundUniqueInput = {
    projectId: string;
    name: string;
};
export type DataTableCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    columns?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type DataTableMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    columns?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type DataTableMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    columns?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type DataTableScalarRelationFilter = {
    is?: Prisma.DataTableWhereInput;
    isNot?: Prisma.DataTableWhereInput;
};
export type DataTableCreateNestedManyWithoutUserInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutUserInput, Prisma.DataTableUncheckedCreateWithoutUserInput> | Prisma.DataTableCreateWithoutUserInput[] | Prisma.DataTableUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutUserInput | Prisma.DataTableCreateOrConnectWithoutUserInput[];
    createMany?: Prisma.DataTableCreateManyUserInputEnvelope;
    connect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
};
export type DataTableUncheckedCreateNestedManyWithoutUserInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutUserInput, Prisma.DataTableUncheckedCreateWithoutUserInput> | Prisma.DataTableCreateWithoutUserInput[] | Prisma.DataTableUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutUserInput | Prisma.DataTableCreateOrConnectWithoutUserInput[];
    createMany?: Prisma.DataTableCreateManyUserInputEnvelope;
    connect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
};
export type DataTableUpdateManyWithoutUserNestedInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutUserInput, Prisma.DataTableUncheckedCreateWithoutUserInput> | Prisma.DataTableCreateWithoutUserInput[] | Prisma.DataTableUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutUserInput | Prisma.DataTableCreateOrConnectWithoutUserInput[];
    upsert?: Prisma.DataTableUpsertWithWhereUniqueWithoutUserInput | Prisma.DataTableUpsertWithWhereUniqueWithoutUserInput[];
    createMany?: Prisma.DataTableCreateManyUserInputEnvelope;
    set?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    disconnect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    delete?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    connect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    update?: Prisma.DataTableUpdateWithWhereUniqueWithoutUserInput | Prisma.DataTableUpdateWithWhereUniqueWithoutUserInput[];
    updateMany?: Prisma.DataTableUpdateManyWithWhereWithoutUserInput | Prisma.DataTableUpdateManyWithWhereWithoutUserInput[];
    deleteMany?: Prisma.DataTableScalarWhereInput | Prisma.DataTableScalarWhereInput[];
};
export type DataTableUncheckedUpdateManyWithoutUserNestedInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutUserInput, Prisma.DataTableUncheckedCreateWithoutUserInput> | Prisma.DataTableCreateWithoutUserInput[] | Prisma.DataTableUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutUserInput | Prisma.DataTableCreateOrConnectWithoutUserInput[];
    upsert?: Prisma.DataTableUpsertWithWhereUniqueWithoutUserInput | Prisma.DataTableUpsertWithWhereUniqueWithoutUserInput[];
    createMany?: Prisma.DataTableCreateManyUserInputEnvelope;
    set?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    disconnect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    delete?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    connect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    update?: Prisma.DataTableUpdateWithWhereUniqueWithoutUserInput | Prisma.DataTableUpdateWithWhereUniqueWithoutUserInput[];
    updateMany?: Prisma.DataTableUpdateManyWithWhereWithoutUserInput | Prisma.DataTableUpdateManyWithWhereWithoutUserInput[];
    deleteMany?: Prisma.DataTableScalarWhereInput | Prisma.DataTableScalarWhereInput[];
};
export type DataTableCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutProjectInput, Prisma.DataTableUncheckedCreateWithoutProjectInput> | Prisma.DataTableCreateWithoutProjectInput[] | Prisma.DataTableUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutProjectInput | Prisma.DataTableCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.DataTableCreateManyProjectInputEnvelope;
    connect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
};
export type DataTableUncheckedCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutProjectInput, Prisma.DataTableUncheckedCreateWithoutProjectInput> | Prisma.DataTableCreateWithoutProjectInput[] | Prisma.DataTableUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutProjectInput | Prisma.DataTableCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.DataTableCreateManyProjectInputEnvelope;
    connect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
};
export type DataTableUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutProjectInput, Prisma.DataTableUncheckedCreateWithoutProjectInput> | Prisma.DataTableCreateWithoutProjectInput[] | Prisma.DataTableUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutProjectInput | Prisma.DataTableCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.DataTableUpsertWithWhereUniqueWithoutProjectInput | Prisma.DataTableUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.DataTableCreateManyProjectInputEnvelope;
    set?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    disconnect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    delete?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    connect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    update?: Prisma.DataTableUpdateWithWhereUniqueWithoutProjectInput | Prisma.DataTableUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.DataTableUpdateManyWithWhereWithoutProjectInput | Prisma.DataTableUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.DataTableScalarWhereInput | Prisma.DataTableScalarWhereInput[];
};
export type DataTableUncheckedUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutProjectInput, Prisma.DataTableUncheckedCreateWithoutProjectInput> | Prisma.DataTableCreateWithoutProjectInput[] | Prisma.DataTableUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutProjectInput | Prisma.DataTableCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.DataTableUpsertWithWhereUniqueWithoutProjectInput | Prisma.DataTableUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.DataTableCreateManyProjectInputEnvelope;
    set?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    disconnect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    delete?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    connect?: Prisma.DataTableWhereUniqueInput | Prisma.DataTableWhereUniqueInput[];
    update?: Prisma.DataTableUpdateWithWhereUniqueWithoutProjectInput | Prisma.DataTableUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.DataTableUpdateManyWithWhereWithoutProjectInput | Prisma.DataTableUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.DataTableScalarWhereInput | Prisma.DataTableScalarWhereInput[];
};
export type DataTableCreateNestedOneWithoutRowsInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutRowsInput, Prisma.DataTableUncheckedCreateWithoutRowsInput>;
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutRowsInput;
    connect?: Prisma.DataTableWhereUniqueInput;
};
export type DataTableUpdateOneRequiredWithoutRowsNestedInput = {
    create?: Prisma.XOR<Prisma.DataTableCreateWithoutRowsInput, Prisma.DataTableUncheckedCreateWithoutRowsInput>;
    connectOrCreate?: Prisma.DataTableCreateOrConnectWithoutRowsInput;
    upsert?: Prisma.DataTableUpsertWithoutRowsInput;
    connect?: Prisma.DataTableWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.DataTableUpdateToOneWithWhereWithoutRowsInput, Prisma.DataTableUpdateWithoutRowsInput>, Prisma.DataTableUncheckedUpdateWithoutRowsInput>;
};
export type DataTableCreateWithoutUserInput = {
    id?: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    project: Prisma.ProjectCreateNestedOneWithoutDataTablesInput;
    rows?: Prisma.DataTableRowCreateNestedManyWithoutTableInput;
};
export type DataTableUncheckedCreateWithoutUserInput = {
    id?: string;
    projectId: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    rows?: Prisma.DataTableRowUncheckedCreateNestedManyWithoutTableInput;
};
export type DataTableCreateOrConnectWithoutUserInput = {
    where: Prisma.DataTableWhereUniqueInput;
    create: Prisma.XOR<Prisma.DataTableCreateWithoutUserInput, Prisma.DataTableUncheckedCreateWithoutUserInput>;
};
export type DataTableCreateManyUserInputEnvelope = {
    data: Prisma.DataTableCreateManyUserInput | Prisma.DataTableCreateManyUserInput[];
    skipDuplicates?: boolean;
};
export type DataTableUpsertWithWhereUniqueWithoutUserInput = {
    where: Prisma.DataTableWhereUniqueInput;
    update: Prisma.XOR<Prisma.DataTableUpdateWithoutUserInput, Prisma.DataTableUncheckedUpdateWithoutUserInput>;
    create: Prisma.XOR<Prisma.DataTableCreateWithoutUserInput, Prisma.DataTableUncheckedCreateWithoutUserInput>;
};
export type DataTableUpdateWithWhereUniqueWithoutUserInput = {
    where: Prisma.DataTableWhereUniqueInput;
    data: Prisma.XOR<Prisma.DataTableUpdateWithoutUserInput, Prisma.DataTableUncheckedUpdateWithoutUserInput>;
};
export type DataTableUpdateManyWithWhereWithoutUserInput = {
    where: Prisma.DataTableScalarWhereInput;
    data: Prisma.XOR<Prisma.DataTableUpdateManyMutationInput, Prisma.DataTableUncheckedUpdateManyWithoutUserInput>;
};
export type DataTableScalarWhereInput = {
    AND?: Prisma.DataTableScalarWhereInput | Prisma.DataTableScalarWhereInput[];
    OR?: Prisma.DataTableScalarWhereInput[];
    NOT?: Prisma.DataTableScalarWhereInput | Prisma.DataTableScalarWhereInput[];
    id?: Prisma.StringFilter<"DataTable"> | string;
    userId?: Prisma.StringFilter<"DataTable"> | string;
    projectId?: Prisma.StringFilter<"DataTable"> | string;
    name?: Prisma.StringFilter<"DataTable"> | string;
    columns?: Prisma.StringFilter<"DataTable"> | string;
    createdAt?: Prisma.DateTimeFilter<"DataTable"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"DataTable"> | Date | string;
};
export type DataTableCreateWithoutProjectInput = {
    id?: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutDataTablesInput;
    rows?: Prisma.DataTableRowCreateNestedManyWithoutTableInput;
};
export type DataTableUncheckedCreateWithoutProjectInput = {
    id?: string;
    userId: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    rows?: Prisma.DataTableRowUncheckedCreateNestedManyWithoutTableInput;
};
export type DataTableCreateOrConnectWithoutProjectInput = {
    where: Prisma.DataTableWhereUniqueInput;
    create: Prisma.XOR<Prisma.DataTableCreateWithoutProjectInput, Prisma.DataTableUncheckedCreateWithoutProjectInput>;
};
export type DataTableCreateManyProjectInputEnvelope = {
    data: Prisma.DataTableCreateManyProjectInput | Prisma.DataTableCreateManyProjectInput[];
    skipDuplicates?: boolean;
};
export type DataTableUpsertWithWhereUniqueWithoutProjectInput = {
    where: Prisma.DataTableWhereUniqueInput;
    update: Prisma.XOR<Prisma.DataTableUpdateWithoutProjectInput, Prisma.DataTableUncheckedUpdateWithoutProjectInput>;
    create: Prisma.XOR<Prisma.DataTableCreateWithoutProjectInput, Prisma.DataTableUncheckedCreateWithoutProjectInput>;
};
export type DataTableUpdateWithWhereUniqueWithoutProjectInput = {
    where: Prisma.DataTableWhereUniqueInput;
    data: Prisma.XOR<Prisma.DataTableUpdateWithoutProjectInput, Prisma.DataTableUncheckedUpdateWithoutProjectInput>;
};
export type DataTableUpdateManyWithWhereWithoutProjectInput = {
    where: Prisma.DataTableScalarWhereInput;
    data: Prisma.XOR<Prisma.DataTableUpdateManyMutationInput, Prisma.DataTableUncheckedUpdateManyWithoutProjectInput>;
};
export type DataTableCreateWithoutRowsInput = {
    id?: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutDataTablesInput;
    project: Prisma.ProjectCreateNestedOneWithoutDataTablesInput;
};
export type DataTableUncheckedCreateWithoutRowsInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type DataTableCreateOrConnectWithoutRowsInput = {
    where: Prisma.DataTableWhereUniqueInput;
    create: Prisma.XOR<Prisma.DataTableCreateWithoutRowsInput, Prisma.DataTableUncheckedCreateWithoutRowsInput>;
};
export type DataTableUpsertWithoutRowsInput = {
    update: Prisma.XOR<Prisma.DataTableUpdateWithoutRowsInput, Prisma.DataTableUncheckedUpdateWithoutRowsInput>;
    create: Prisma.XOR<Prisma.DataTableCreateWithoutRowsInput, Prisma.DataTableUncheckedCreateWithoutRowsInput>;
    where?: Prisma.DataTableWhereInput;
};
export type DataTableUpdateToOneWithWhereWithoutRowsInput = {
    where?: Prisma.DataTableWhereInput;
    data: Prisma.XOR<Prisma.DataTableUpdateWithoutRowsInput, Prisma.DataTableUncheckedUpdateWithoutRowsInput>;
};
export type DataTableUpdateWithoutRowsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutDataTablesNestedInput;
    project?: Prisma.ProjectUpdateOneRequiredWithoutDataTablesNestedInput;
};
export type DataTableUncheckedUpdateWithoutRowsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableCreateManyUserInput = {
    id?: string;
    projectId: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type DataTableUpdateWithoutUserInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    project?: Prisma.ProjectUpdateOneRequiredWithoutDataTablesNestedInput;
    rows?: Prisma.DataTableRowUpdateManyWithoutTableNestedInput;
};
export type DataTableUncheckedUpdateWithoutUserInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    rows?: Prisma.DataTableRowUncheckedUpdateManyWithoutTableNestedInput;
};
export type DataTableUncheckedUpdateManyWithoutUserInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableCreateManyProjectInput = {
    id?: string;
    userId: string;
    name: string;
    columns?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type DataTableUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutDataTablesNestedInput;
    rows?: Prisma.DataTableRowUpdateManyWithoutTableNestedInput;
};
export type DataTableUncheckedUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    rows?: Prisma.DataTableRowUncheckedUpdateManyWithoutTableNestedInput;
};
export type DataTableUncheckedUpdateManyWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    columns?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
/**
 * Count Type DataTableCountOutputType
 */
export type DataTableCountOutputType = {
    rows: number;
};
export type DataTableCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    rows?: boolean | DataTableCountOutputTypeCountRowsArgs;
};
/**
 * DataTableCountOutputType without action
 */
export type DataTableCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableCountOutputType
     */
    select?: Prisma.DataTableCountOutputTypeSelect<ExtArgs> | null;
};
/**
 * DataTableCountOutputType without action
 */
export type DataTableCountOutputTypeCountRowsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.DataTableRowWhereInput;
};
export type DataTableSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    columns?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    rows?: boolean | Prisma.DataTable$rowsArgs<ExtArgs>;
    _count?: boolean | Prisma.DataTableCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["dataTable"]>;
export type DataTableSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    columns?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["dataTable"]>;
export type DataTableSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    columns?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["dataTable"]>;
export type DataTableSelectScalar = {
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    columns?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type DataTableOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "userId" | "projectId" | "name" | "columns" | "createdAt" | "updatedAt", ExtArgs["result"]["dataTable"]>;
export type DataTableInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    rows?: boolean | Prisma.DataTable$rowsArgs<ExtArgs>;
    _count?: boolean | Prisma.DataTableCountOutputTypeDefaultArgs<ExtArgs>;
};
export type DataTableIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
};
export type DataTableIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
};
export type $DataTablePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "DataTable";
    objects: {
        user: Prisma.$UserPayload<ExtArgs>;
        project: Prisma.$ProjectPayload<ExtArgs>;
        rows: Prisma.$DataTableRowPayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        userId: string;
        projectId: string;
        name: string;
        columns: string;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["dataTable"]>;
    composites: {};
};
export type DataTableGetPayload<S extends boolean | null | undefined | DataTableDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$DataTablePayload, S>;
export type DataTableCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<DataTableFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: DataTableCountAggregateInputType | true;
};
export interface DataTableDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['DataTable'];
        meta: {
            name: 'DataTable';
        };
    };
    /**
     * Find zero or one DataTable that matches the filter.
     * @param {DataTableFindUniqueArgs} args - Arguments to find a DataTable
     * @example
     * // Get one DataTable
     * const dataTable = await prisma.dataTable.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DataTableFindUniqueArgs>(args: Prisma.SelectSubset<T, DataTableFindUniqueArgs<ExtArgs>>): Prisma.Prisma__DataTableClient<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one DataTable that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DataTableFindUniqueOrThrowArgs} args - Arguments to find a DataTable
     * @example
     * // Get one DataTable
     * const dataTable = await prisma.dataTable.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DataTableFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, DataTableFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__DataTableClient<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first DataTable that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableFindFirstArgs} args - Arguments to find a DataTable
     * @example
     * // Get one DataTable
     * const dataTable = await prisma.dataTable.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DataTableFindFirstArgs>(args?: Prisma.SelectSubset<T, DataTableFindFirstArgs<ExtArgs>>): Prisma.Prisma__DataTableClient<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first DataTable that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableFindFirstOrThrowArgs} args - Arguments to find a DataTable
     * @example
     * // Get one DataTable
     * const dataTable = await prisma.dataTable.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DataTableFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, DataTableFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__DataTableClient<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more DataTables that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all DataTables
     * const dataTables = await prisma.dataTable.findMany()
     *
     * // Get first 10 DataTables
     * const dataTables = await prisma.dataTable.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const dataTableWithIdOnly = await prisma.dataTable.findMany({ select: { id: true } })
     *
     */
    findMany<T extends DataTableFindManyArgs>(args?: Prisma.SelectSubset<T, DataTableFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a DataTable.
     * @param {DataTableCreateArgs} args - Arguments to create a DataTable.
     * @example
     * // Create one DataTable
     * const DataTable = await prisma.dataTable.create({
     *   data: {
     *     // ... data to create a DataTable
     *   }
     * })
     *
     */
    create<T extends DataTableCreateArgs>(args: Prisma.SelectSubset<T, DataTableCreateArgs<ExtArgs>>): Prisma.Prisma__DataTableClient<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many DataTables.
     * @param {DataTableCreateManyArgs} args - Arguments to create many DataTables.
     * @example
     * // Create many DataTables
     * const dataTable = await prisma.dataTable.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends DataTableCreateManyArgs>(args?: Prisma.SelectSubset<T, DataTableCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many DataTables and returns the data saved in the database.
     * @param {DataTableCreateManyAndReturnArgs} args - Arguments to create many DataTables.
     * @example
     * // Create many DataTables
     * const dataTable = await prisma.dataTable.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many DataTables and only return the `id`
     * const dataTableWithIdOnly = await prisma.dataTable.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends DataTableCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, DataTableCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a DataTable.
     * @param {DataTableDeleteArgs} args - Arguments to delete one DataTable.
     * @example
     * // Delete one DataTable
     * const DataTable = await prisma.dataTable.delete({
     *   where: {
     *     // ... filter to delete one DataTable
     *   }
     * })
     *
     */
    delete<T extends DataTableDeleteArgs>(args: Prisma.SelectSubset<T, DataTableDeleteArgs<ExtArgs>>): Prisma.Prisma__DataTableClient<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one DataTable.
     * @param {DataTableUpdateArgs} args - Arguments to update one DataTable.
     * @example
     * // Update one DataTable
     * const dataTable = await prisma.dataTable.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends DataTableUpdateArgs>(args: Prisma.SelectSubset<T, DataTableUpdateArgs<ExtArgs>>): Prisma.Prisma__DataTableClient<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more DataTables.
     * @param {DataTableDeleteManyArgs} args - Arguments to filter DataTables to delete.
     * @example
     * // Delete a few DataTables
     * const { count } = await prisma.dataTable.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends DataTableDeleteManyArgs>(args?: Prisma.SelectSubset<T, DataTableDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more DataTables.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many DataTables
     * const dataTable = await prisma.dataTable.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends DataTableUpdateManyArgs>(args: Prisma.SelectSubset<T, DataTableUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more DataTables and returns the data updated in the database.
     * @param {DataTableUpdateManyAndReturnArgs} args - Arguments to update many DataTables.
     * @example
     * // Update many DataTables
     * const dataTable = await prisma.dataTable.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more DataTables and only return the `id`
     * const dataTableWithIdOnly = await prisma.dataTable.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    updateManyAndReturn<T extends DataTableUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, DataTableUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one DataTable.
     * @param {DataTableUpsertArgs} args - Arguments to update or create a DataTable.
     * @example
     * // Update or create a DataTable
     * const dataTable = await prisma.dataTable.upsert({
     *   create: {
     *     // ... data to create a DataTable
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the DataTable we want to update
     *   }
     * })
     */
    upsert<T extends DataTableUpsertArgs>(args: Prisma.SelectSubset<T, DataTableUpsertArgs<ExtArgs>>): Prisma.Prisma__DataTableClient<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of DataTables.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableCountArgs} args - Arguments to filter DataTables to count.
     * @example
     * // Count the number of DataTables
     * const count = await prisma.dataTable.count({
     *   where: {
     *     // ... the filter for the DataTables we want to count
     *   }
     * })
    **/
    count<T extends DataTableCountArgs>(args?: Prisma.Subset<T, DataTableCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], DataTableCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a DataTable.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DataTableAggregateArgs>(args: Prisma.Subset<T, DataTableAggregateArgs>): Prisma.PrismaPromise<GetDataTableAggregateType<T>>;
    /**
     * Group by DataTable.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
    **/
    groupBy<T extends DataTableGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: DataTableGroupByArgs['orderBy'];
    } : {
        orderBy?: DataTableGroupByArgs['orderBy'];
    }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True ? `Error: "by" must not be empty.` : HavingValid extends Prisma.False ? {
        [P in HavingFields]: P extends ByFields ? never : P extends string ? `Error: Field "${P}" used in "having" needs to be provided in "by".` : [
            Error,
            'Field ',
            P,
            ` in "having" needs to be provided in "by"`
        ];
    }[HavingFields] : 'take' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "take", you also need to provide "orderBy"' : 'skip' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "skip", you also need to provide "orderBy"' : ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, DataTableGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDataTableGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the DataTable model
     */
    readonly fields: DataTableFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for DataTable.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__DataTableClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    user<T extends Prisma.UserDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.UserDefaultArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    project<T extends Prisma.ProjectDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ProjectDefaultArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    rows<T extends Prisma.DataTable$rowsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.DataTable$rowsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
/**
 * Fields of the DataTable model
 */
export interface DataTableFieldRefs {
    readonly id: Prisma.FieldRef<"DataTable", 'String'>;
    readonly userId: Prisma.FieldRef<"DataTable", 'String'>;
    readonly projectId: Prisma.FieldRef<"DataTable", 'String'>;
    readonly name: Prisma.FieldRef<"DataTable", 'String'>;
    readonly columns: Prisma.FieldRef<"DataTable", 'String'>;
    readonly createdAt: Prisma.FieldRef<"DataTable", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"DataTable", 'DateTime'>;
}
/**
 * DataTable findUnique
 */
export type DataTableFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
    /**
     * Filter, which DataTable to fetch.
     */
    where: Prisma.DataTableWhereUniqueInput;
};
/**
 * DataTable findUniqueOrThrow
 */
export type DataTableFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
    /**
     * Filter, which DataTable to fetch.
     */
    where: Prisma.DataTableWhereUniqueInput;
};
/**
 * DataTable findFirst
 */
export type DataTableFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
    /**
     * Filter, which DataTable to fetch.
     */
    where?: Prisma.DataTableWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DataTables to fetch.
     */
    orderBy?: Prisma.DataTableOrderByWithRelationInput | Prisma.DataTableOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for DataTables.
     */
    cursor?: Prisma.DataTableWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DataTables from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DataTables.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of DataTables.
     */
    distinct?: Prisma.DataTableScalarFieldEnum | Prisma.DataTableScalarFieldEnum[];
};
/**
 * DataTable findFirstOrThrow
 */
export type DataTableFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
    /**
     * Filter, which DataTable to fetch.
     */
    where?: Prisma.DataTableWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DataTables to fetch.
     */
    orderBy?: Prisma.DataTableOrderByWithRelationInput | Prisma.DataTableOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for DataTables.
     */
    cursor?: Prisma.DataTableWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DataTables from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DataTables.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of DataTables.
     */
    distinct?: Prisma.DataTableScalarFieldEnum | Prisma.DataTableScalarFieldEnum[];
};
/**
 * DataTable findMany
 */
export type DataTableFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
    /**
     * Filter, which DataTables to fetch.
     */
    where?: Prisma.DataTableWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DataTables to fetch.
     */
    orderBy?: Prisma.DataTableOrderByWithRelationInput | Prisma.DataTableOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing DataTables.
     */
    cursor?: Prisma.DataTableWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DataTables from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DataTables.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of DataTables.
     */
    distinct?: Prisma.DataTableScalarFieldEnum | Prisma.DataTableScalarFieldEnum[];
};
/**
 * DataTable create
 */
export type DataTableCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
    /**
     * The data needed to create a DataTable.
     */
    data: Prisma.XOR<Prisma.DataTableCreateInput, Prisma.DataTableUncheckedCreateInput>;
};
/**
 * DataTable createMany
 */
export type DataTableCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many DataTables.
     */
    data: Prisma.DataTableCreateManyInput | Prisma.DataTableCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * DataTable createManyAndReturn
 */
export type DataTableCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * The data used to create many DataTables.
     */
    data: Prisma.DataTableCreateManyInput | Prisma.DataTableCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * DataTable update
 */
export type DataTableUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
    /**
     * The data needed to update a DataTable.
     */
    data: Prisma.XOR<Prisma.DataTableUpdateInput, Prisma.DataTableUncheckedUpdateInput>;
    /**
     * Choose, which DataTable to update.
     */
    where: Prisma.DataTableWhereUniqueInput;
};
/**
 * DataTable updateMany
 */
export type DataTableUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update DataTables.
     */
    data: Prisma.XOR<Prisma.DataTableUpdateManyMutationInput, Prisma.DataTableUncheckedUpdateManyInput>;
    /**
     * Filter which DataTables to update
     */
    where?: Prisma.DataTableWhereInput;
    /**
     * Limit how many DataTables to update.
     */
    limit?: number;
};
/**
 * DataTable updateManyAndReturn
 */
export type DataTableUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * The data used to update DataTables.
     */
    data: Prisma.XOR<Prisma.DataTableUpdateManyMutationInput, Prisma.DataTableUncheckedUpdateManyInput>;
    /**
     * Filter which DataTables to update
     */
    where?: Prisma.DataTableWhereInput;
    /**
     * Limit how many DataTables to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * DataTable upsert
 */
export type DataTableUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
    /**
     * The filter to search for the DataTable to update in case it exists.
     */
    where: Prisma.DataTableWhereUniqueInput;
    /**
     * In case the DataTable found by the `where` argument doesn't exist, create a new DataTable with this data.
     */
    create: Prisma.XOR<Prisma.DataTableCreateInput, Prisma.DataTableUncheckedCreateInput>;
    /**
     * In case the DataTable was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.DataTableUpdateInput, Prisma.DataTableUncheckedUpdateInput>;
};
/**
 * DataTable delete
 */
export type DataTableDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
    /**
     * Filter which DataTable to delete.
     */
    where: Prisma.DataTableWhereUniqueInput;
};
/**
 * DataTable deleteMany
 */
export type DataTableDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which DataTables to delete
     */
    where?: Prisma.DataTableWhereInput;
    /**
     * Limit how many DataTables to delete.
     */
    limit?: number;
};
/**
 * DataTable.rows
 */
export type DataTable$rowsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    where?: Prisma.DataTableRowWhereInput;
    orderBy?: Prisma.DataTableRowOrderByWithRelationInput | Prisma.DataTableRowOrderByWithRelationInput[];
    cursor?: Prisma.DataTableRowWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.DataTableRowScalarFieldEnum | Prisma.DataTableRowScalarFieldEnum[];
};
/**
 * DataTable without action
 */
export type DataTableDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTable
     */
    select?: Prisma.DataTableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTable
     */
    omit?: Prisma.DataTableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableInclude<ExtArgs> | null;
};
