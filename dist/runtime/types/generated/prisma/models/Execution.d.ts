import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model Execution
 *
 */
export type ExecutionModel = runtime.Types.Result.DefaultSelection<Prisma.$ExecutionPayload>;
export type AggregateExecution = {
    _count: ExecutionCountAggregateOutputType | null;
    _min: ExecutionMinAggregateOutputType | null;
    _max: ExecutionMaxAggregateOutputType | null;
};
export type ExecutionMinAggregateOutputType = {
    id: string | null;
    workflowId: string | null;
    status: string | null;
    mode: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    runData: string | null;
    error: string | null;
};
export type ExecutionMaxAggregateOutputType = {
    id: string | null;
    workflowId: string | null;
    status: string | null;
    mode: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    runData: string | null;
    error: string | null;
};
export type ExecutionCountAggregateOutputType = {
    id: number;
    workflowId: number;
    status: number;
    mode: number;
    startedAt: number;
    finishedAt: number;
    runData: number;
    error: number;
    _all: number;
};
export type ExecutionMinAggregateInputType = {
    id?: true;
    workflowId?: true;
    status?: true;
    mode?: true;
    startedAt?: true;
    finishedAt?: true;
    runData?: true;
    error?: true;
};
export type ExecutionMaxAggregateInputType = {
    id?: true;
    workflowId?: true;
    status?: true;
    mode?: true;
    startedAt?: true;
    finishedAt?: true;
    runData?: true;
    error?: true;
};
export type ExecutionCountAggregateInputType = {
    id?: true;
    workflowId?: true;
    status?: true;
    mode?: true;
    startedAt?: true;
    finishedAt?: true;
    runData?: true;
    error?: true;
    _all?: true;
};
export type ExecutionAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Execution to aggregate.
     */
    where?: Prisma.ExecutionWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Executions to fetch.
     */
    orderBy?: Prisma.ExecutionOrderByWithRelationInput | Prisma.ExecutionOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.ExecutionWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Executions from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Executions.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Executions
    **/
    _count?: true | ExecutionCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: ExecutionMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: ExecutionMaxAggregateInputType;
};
export type GetExecutionAggregateType<T extends ExecutionAggregateArgs> = {
    [P in keyof T & keyof AggregateExecution]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateExecution[P]> : Prisma.GetScalarType<T[P], AggregateExecution[P]>;
};
export type ExecutionGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ExecutionWhereInput;
    orderBy?: Prisma.ExecutionOrderByWithAggregationInput | Prisma.ExecutionOrderByWithAggregationInput[];
    by: Prisma.ExecutionScalarFieldEnum[] | Prisma.ExecutionScalarFieldEnum;
    having?: Prisma.ExecutionScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: ExecutionCountAggregateInputType | true;
    _min?: ExecutionMinAggregateInputType;
    _max?: ExecutionMaxAggregateInputType;
};
export type ExecutionGroupByOutputType = {
    id: string;
    workflowId: string;
    status: string;
    mode: string;
    startedAt: Date;
    finishedAt: Date | null;
    runData: string;
    error: string | null;
    _count: ExecutionCountAggregateOutputType | null;
    _min: ExecutionMinAggregateOutputType | null;
    _max: ExecutionMaxAggregateOutputType | null;
};
export type GetExecutionGroupByPayload<T extends ExecutionGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<ExecutionGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof ExecutionGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], ExecutionGroupByOutputType[P]> : Prisma.GetScalarType<T[P], ExecutionGroupByOutputType[P]>;
}>>;
export type ExecutionWhereInput = {
    AND?: Prisma.ExecutionWhereInput | Prisma.ExecutionWhereInput[];
    OR?: Prisma.ExecutionWhereInput[];
    NOT?: Prisma.ExecutionWhereInput | Prisma.ExecutionWhereInput[];
    id?: Prisma.StringFilter<"Execution"> | string;
    workflowId?: Prisma.StringFilter<"Execution"> | string;
    status?: Prisma.StringFilter<"Execution"> | string;
    mode?: Prisma.StringFilter<"Execution"> | string;
    startedAt?: Prisma.DateTimeFilter<"Execution"> | Date | string;
    finishedAt?: Prisma.DateTimeNullableFilter<"Execution"> | Date | string | null;
    runData?: Prisma.StringFilter<"Execution"> | string;
    error?: Prisma.StringNullableFilter<"Execution"> | string | null;
    workflow?: Prisma.XOR<Prisma.WorkflowScalarRelationFilter, Prisma.WorkflowWhereInput>;
};
export type ExecutionOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    mode?: Prisma.SortOrder;
    startedAt?: Prisma.SortOrder;
    finishedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    runData?: Prisma.SortOrder;
    error?: Prisma.SortOrderInput | Prisma.SortOrder;
    workflow?: Prisma.WorkflowOrderByWithRelationInput;
};
export type ExecutionWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.ExecutionWhereInput | Prisma.ExecutionWhereInput[];
    OR?: Prisma.ExecutionWhereInput[];
    NOT?: Prisma.ExecutionWhereInput | Prisma.ExecutionWhereInput[];
    workflowId?: Prisma.StringFilter<"Execution"> | string;
    status?: Prisma.StringFilter<"Execution"> | string;
    mode?: Prisma.StringFilter<"Execution"> | string;
    startedAt?: Prisma.DateTimeFilter<"Execution"> | Date | string;
    finishedAt?: Prisma.DateTimeNullableFilter<"Execution"> | Date | string | null;
    runData?: Prisma.StringFilter<"Execution"> | string;
    error?: Prisma.StringNullableFilter<"Execution"> | string | null;
    workflow?: Prisma.XOR<Prisma.WorkflowScalarRelationFilter, Prisma.WorkflowWhereInput>;
}, "id">;
export type ExecutionOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    mode?: Prisma.SortOrder;
    startedAt?: Prisma.SortOrder;
    finishedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    runData?: Prisma.SortOrder;
    error?: Prisma.SortOrderInput | Prisma.SortOrder;
    _count?: Prisma.ExecutionCountOrderByAggregateInput;
    _max?: Prisma.ExecutionMaxOrderByAggregateInput;
    _min?: Prisma.ExecutionMinOrderByAggregateInput;
};
export type ExecutionScalarWhereWithAggregatesInput = {
    AND?: Prisma.ExecutionScalarWhereWithAggregatesInput | Prisma.ExecutionScalarWhereWithAggregatesInput[];
    OR?: Prisma.ExecutionScalarWhereWithAggregatesInput[];
    NOT?: Prisma.ExecutionScalarWhereWithAggregatesInput | Prisma.ExecutionScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Execution"> | string;
    workflowId?: Prisma.StringWithAggregatesFilter<"Execution"> | string;
    status?: Prisma.StringWithAggregatesFilter<"Execution"> | string;
    mode?: Prisma.StringWithAggregatesFilter<"Execution"> | string;
    startedAt?: Prisma.DateTimeWithAggregatesFilter<"Execution"> | Date | string;
    finishedAt?: Prisma.DateTimeNullableWithAggregatesFilter<"Execution"> | Date | string | null;
    runData?: Prisma.StringWithAggregatesFilter<"Execution"> | string;
    error?: Prisma.StringNullableWithAggregatesFilter<"Execution"> | string | null;
};
export type ExecutionCreateInput = {
    id?: string;
    status?: string;
    mode: string;
    startedAt?: Date | string;
    finishedAt?: Date | string | null;
    runData?: string;
    error?: string | null;
    workflow: Prisma.WorkflowCreateNestedOneWithoutExecutionsInput;
};
export type ExecutionUncheckedCreateInput = {
    id?: string;
    workflowId: string;
    status?: string;
    mode: string;
    startedAt?: Date | string;
    finishedAt?: Date | string | null;
    runData?: string;
    error?: string | null;
};
export type ExecutionUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    mode?: Prisma.StringFieldUpdateOperationsInput | string;
    startedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    finishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    runData?: Prisma.StringFieldUpdateOperationsInput | string;
    error?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    workflow?: Prisma.WorkflowUpdateOneRequiredWithoutExecutionsNestedInput;
};
export type ExecutionUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    workflowId?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    mode?: Prisma.StringFieldUpdateOperationsInput | string;
    startedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    finishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    runData?: Prisma.StringFieldUpdateOperationsInput | string;
    error?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type ExecutionCreateManyInput = {
    id?: string;
    workflowId: string;
    status?: string;
    mode: string;
    startedAt?: Date | string;
    finishedAt?: Date | string | null;
    runData?: string;
    error?: string | null;
};
export type ExecutionUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    mode?: Prisma.StringFieldUpdateOperationsInput | string;
    startedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    finishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    runData?: Prisma.StringFieldUpdateOperationsInput | string;
    error?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type ExecutionUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    workflowId?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    mode?: Prisma.StringFieldUpdateOperationsInput | string;
    startedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    finishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    runData?: Prisma.StringFieldUpdateOperationsInput | string;
    error?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type ExecutionListRelationFilter = {
    every?: Prisma.ExecutionWhereInput;
    some?: Prisma.ExecutionWhereInput;
    none?: Prisma.ExecutionWhereInput;
};
export type ExecutionOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type ExecutionCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    mode?: Prisma.SortOrder;
    startedAt?: Prisma.SortOrder;
    finishedAt?: Prisma.SortOrder;
    runData?: Prisma.SortOrder;
    error?: Prisma.SortOrder;
};
export type ExecutionMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    mode?: Prisma.SortOrder;
    startedAt?: Prisma.SortOrder;
    finishedAt?: Prisma.SortOrder;
    runData?: Prisma.SortOrder;
    error?: Prisma.SortOrder;
};
export type ExecutionMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    mode?: Prisma.SortOrder;
    startedAt?: Prisma.SortOrder;
    finishedAt?: Prisma.SortOrder;
    runData?: Prisma.SortOrder;
    error?: Prisma.SortOrder;
};
export type ExecutionCreateNestedManyWithoutWorkflowInput = {
    create?: Prisma.XOR<Prisma.ExecutionCreateWithoutWorkflowInput, Prisma.ExecutionUncheckedCreateWithoutWorkflowInput> | Prisma.ExecutionCreateWithoutWorkflowInput[] | Prisma.ExecutionUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.ExecutionCreateOrConnectWithoutWorkflowInput | Prisma.ExecutionCreateOrConnectWithoutWorkflowInput[];
    createMany?: Prisma.ExecutionCreateManyWorkflowInputEnvelope;
    connect?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
};
export type ExecutionUncheckedCreateNestedManyWithoutWorkflowInput = {
    create?: Prisma.XOR<Prisma.ExecutionCreateWithoutWorkflowInput, Prisma.ExecutionUncheckedCreateWithoutWorkflowInput> | Prisma.ExecutionCreateWithoutWorkflowInput[] | Prisma.ExecutionUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.ExecutionCreateOrConnectWithoutWorkflowInput | Prisma.ExecutionCreateOrConnectWithoutWorkflowInput[];
    createMany?: Prisma.ExecutionCreateManyWorkflowInputEnvelope;
    connect?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
};
export type ExecutionUpdateManyWithoutWorkflowNestedInput = {
    create?: Prisma.XOR<Prisma.ExecutionCreateWithoutWorkflowInput, Prisma.ExecutionUncheckedCreateWithoutWorkflowInput> | Prisma.ExecutionCreateWithoutWorkflowInput[] | Prisma.ExecutionUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.ExecutionCreateOrConnectWithoutWorkflowInput | Prisma.ExecutionCreateOrConnectWithoutWorkflowInput[];
    upsert?: Prisma.ExecutionUpsertWithWhereUniqueWithoutWorkflowInput | Prisma.ExecutionUpsertWithWhereUniqueWithoutWorkflowInput[];
    createMany?: Prisma.ExecutionCreateManyWorkflowInputEnvelope;
    set?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
    disconnect?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
    delete?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
    connect?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
    update?: Prisma.ExecutionUpdateWithWhereUniqueWithoutWorkflowInput | Prisma.ExecutionUpdateWithWhereUniqueWithoutWorkflowInput[];
    updateMany?: Prisma.ExecutionUpdateManyWithWhereWithoutWorkflowInput | Prisma.ExecutionUpdateManyWithWhereWithoutWorkflowInput[];
    deleteMany?: Prisma.ExecutionScalarWhereInput | Prisma.ExecutionScalarWhereInput[];
};
export type ExecutionUncheckedUpdateManyWithoutWorkflowNestedInput = {
    create?: Prisma.XOR<Prisma.ExecutionCreateWithoutWorkflowInput, Prisma.ExecutionUncheckedCreateWithoutWorkflowInput> | Prisma.ExecutionCreateWithoutWorkflowInput[] | Prisma.ExecutionUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.ExecutionCreateOrConnectWithoutWorkflowInput | Prisma.ExecutionCreateOrConnectWithoutWorkflowInput[];
    upsert?: Prisma.ExecutionUpsertWithWhereUniqueWithoutWorkflowInput | Prisma.ExecutionUpsertWithWhereUniqueWithoutWorkflowInput[];
    createMany?: Prisma.ExecutionCreateManyWorkflowInputEnvelope;
    set?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
    disconnect?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
    delete?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
    connect?: Prisma.ExecutionWhereUniqueInput | Prisma.ExecutionWhereUniqueInput[];
    update?: Prisma.ExecutionUpdateWithWhereUniqueWithoutWorkflowInput | Prisma.ExecutionUpdateWithWhereUniqueWithoutWorkflowInput[];
    updateMany?: Prisma.ExecutionUpdateManyWithWhereWithoutWorkflowInput | Prisma.ExecutionUpdateManyWithWhereWithoutWorkflowInput[];
    deleteMany?: Prisma.ExecutionScalarWhereInput | Prisma.ExecutionScalarWhereInput[];
};
export type ExecutionCreateWithoutWorkflowInput = {
    id?: string;
    status?: string;
    mode: string;
    startedAt?: Date | string;
    finishedAt?: Date | string | null;
    runData?: string;
    error?: string | null;
};
export type ExecutionUncheckedCreateWithoutWorkflowInput = {
    id?: string;
    status?: string;
    mode: string;
    startedAt?: Date | string;
    finishedAt?: Date | string | null;
    runData?: string;
    error?: string | null;
};
export type ExecutionCreateOrConnectWithoutWorkflowInput = {
    where: Prisma.ExecutionWhereUniqueInput;
    create: Prisma.XOR<Prisma.ExecutionCreateWithoutWorkflowInput, Prisma.ExecutionUncheckedCreateWithoutWorkflowInput>;
};
export type ExecutionCreateManyWorkflowInputEnvelope = {
    data: Prisma.ExecutionCreateManyWorkflowInput | Prisma.ExecutionCreateManyWorkflowInput[];
    skipDuplicates?: boolean;
};
export type ExecutionUpsertWithWhereUniqueWithoutWorkflowInput = {
    where: Prisma.ExecutionWhereUniqueInput;
    update: Prisma.XOR<Prisma.ExecutionUpdateWithoutWorkflowInput, Prisma.ExecutionUncheckedUpdateWithoutWorkflowInput>;
    create: Prisma.XOR<Prisma.ExecutionCreateWithoutWorkflowInput, Prisma.ExecutionUncheckedCreateWithoutWorkflowInput>;
};
export type ExecutionUpdateWithWhereUniqueWithoutWorkflowInput = {
    where: Prisma.ExecutionWhereUniqueInput;
    data: Prisma.XOR<Prisma.ExecutionUpdateWithoutWorkflowInput, Prisma.ExecutionUncheckedUpdateWithoutWorkflowInput>;
};
export type ExecutionUpdateManyWithWhereWithoutWorkflowInput = {
    where: Prisma.ExecutionScalarWhereInput;
    data: Prisma.XOR<Prisma.ExecutionUpdateManyMutationInput, Prisma.ExecutionUncheckedUpdateManyWithoutWorkflowInput>;
};
export type ExecutionScalarWhereInput = {
    AND?: Prisma.ExecutionScalarWhereInput | Prisma.ExecutionScalarWhereInput[];
    OR?: Prisma.ExecutionScalarWhereInput[];
    NOT?: Prisma.ExecutionScalarWhereInput | Prisma.ExecutionScalarWhereInput[];
    id?: Prisma.StringFilter<"Execution"> | string;
    workflowId?: Prisma.StringFilter<"Execution"> | string;
    status?: Prisma.StringFilter<"Execution"> | string;
    mode?: Prisma.StringFilter<"Execution"> | string;
    startedAt?: Prisma.DateTimeFilter<"Execution"> | Date | string;
    finishedAt?: Prisma.DateTimeNullableFilter<"Execution"> | Date | string | null;
    runData?: Prisma.StringFilter<"Execution"> | string;
    error?: Prisma.StringNullableFilter<"Execution"> | string | null;
};
export type ExecutionCreateManyWorkflowInput = {
    id?: string;
    status?: string;
    mode: string;
    startedAt?: Date | string;
    finishedAt?: Date | string | null;
    runData?: string;
    error?: string | null;
};
export type ExecutionUpdateWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    mode?: Prisma.StringFieldUpdateOperationsInput | string;
    startedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    finishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    runData?: Prisma.StringFieldUpdateOperationsInput | string;
    error?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type ExecutionUncheckedUpdateWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    mode?: Prisma.StringFieldUpdateOperationsInput | string;
    startedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    finishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    runData?: Prisma.StringFieldUpdateOperationsInput | string;
    error?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type ExecutionUncheckedUpdateManyWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    mode?: Prisma.StringFieldUpdateOperationsInput | string;
    startedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    finishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    runData?: Prisma.StringFieldUpdateOperationsInput | string;
    error?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type ExecutionSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    workflowId?: boolean;
    status?: boolean;
    mode?: boolean;
    startedAt?: boolean;
    finishedAt?: boolean;
    runData?: boolean;
    error?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["execution"]>;
export type ExecutionSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    workflowId?: boolean;
    status?: boolean;
    mode?: boolean;
    startedAt?: boolean;
    finishedAt?: boolean;
    runData?: boolean;
    error?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["execution"]>;
export type ExecutionSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    workflowId?: boolean;
    status?: boolean;
    mode?: boolean;
    startedAt?: boolean;
    finishedAt?: boolean;
    runData?: boolean;
    error?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["execution"]>;
export type ExecutionSelectScalar = {
    id?: boolean;
    workflowId?: boolean;
    status?: boolean;
    mode?: boolean;
    startedAt?: boolean;
    finishedAt?: boolean;
    runData?: boolean;
    error?: boolean;
};
export type ExecutionOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "workflowId" | "status" | "mode" | "startedAt" | "finishedAt" | "runData" | "error", ExtArgs["result"]["execution"]>;
export type ExecutionInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type ExecutionIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type ExecutionIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type $ExecutionPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Execution";
    objects: {
        workflow: Prisma.$WorkflowPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        workflowId: string;
        status: string;
        mode: string;
        startedAt: Date;
        finishedAt: Date | null;
        runData: string;
        error: string | null;
    }, ExtArgs["result"]["execution"]>;
    composites: {};
};
export type ExecutionGetPayload<S extends boolean | null | undefined | ExecutionDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$ExecutionPayload, S>;
export type ExecutionCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<ExecutionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: ExecutionCountAggregateInputType | true;
};
export interface ExecutionDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Execution'];
        meta: {
            name: 'Execution';
        };
    };
    /**
     * Find zero or one Execution that matches the filter.
     * @param {ExecutionFindUniqueArgs} args - Arguments to find a Execution
     * @example
     * // Get one Execution
     * const execution = await prisma.execution.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ExecutionFindUniqueArgs>(args: Prisma.SelectSubset<T, ExecutionFindUniqueArgs<ExtArgs>>): Prisma.Prisma__ExecutionClient<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Execution that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ExecutionFindUniqueOrThrowArgs} args - Arguments to find a Execution
     * @example
     * // Get one Execution
     * const execution = await prisma.execution.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ExecutionFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, ExecutionFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__ExecutionClient<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Execution that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionFindFirstArgs} args - Arguments to find a Execution
     * @example
     * // Get one Execution
     * const execution = await prisma.execution.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ExecutionFindFirstArgs>(args?: Prisma.SelectSubset<T, ExecutionFindFirstArgs<ExtArgs>>): Prisma.Prisma__ExecutionClient<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Execution that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionFindFirstOrThrowArgs} args - Arguments to find a Execution
     * @example
     * // Get one Execution
     * const execution = await prisma.execution.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ExecutionFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, ExecutionFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__ExecutionClient<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Executions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Executions
     * const executions = await prisma.execution.findMany()
     *
     * // Get first 10 Executions
     * const executions = await prisma.execution.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const executionWithIdOnly = await prisma.execution.findMany({ select: { id: true } })
     *
     */
    findMany<T extends ExecutionFindManyArgs>(args?: Prisma.SelectSubset<T, ExecutionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Execution.
     * @param {ExecutionCreateArgs} args - Arguments to create a Execution.
     * @example
     * // Create one Execution
     * const Execution = await prisma.execution.create({
     *   data: {
     *     // ... data to create a Execution
     *   }
     * })
     *
     */
    create<T extends ExecutionCreateArgs>(args: Prisma.SelectSubset<T, ExecutionCreateArgs<ExtArgs>>): Prisma.Prisma__ExecutionClient<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Executions.
     * @param {ExecutionCreateManyArgs} args - Arguments to create many Executions.
     * @example
     * // Create many Executions
     * const execution = await prisma.execution.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends ExecutionCreateManyArgs>(args?: Prisma.SelectSubset<T, ExecutionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Executions and returns the data saved in the database.
     * @param {ExecutionCreateManyAndReturnArgs} args - Arguments to create many Executions.
     * @example
     * // Create many Executions
     * const execution = await prisma.execution.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Executions and only return the `id`
     * const executionWithIdOnly = await prisma.execution.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends ExecutionCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, ExecutionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Execution.
     * @param {ExecutionDeleteArgs} args - Arguments to delete one Execution.
     * @example
     * // Delete one Execution
     * const Execution = await prisma.execution.delete({
     *   where: {
     *     // ... filter to delete one Execution
     *   }
     * })
     *
     */
    delete<T extends ExecutionDeleteArgs>(args: Prisma.SelectSubset<T, ExecutionDeleteArgs<ExtArgs>>): Prisma.Prisma__ExecutionClient<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Execution.
     * @param {ExecutionUpdateArgs} args - Arguments to update one Execution.
     * @example
     * // Update one Execution
     * const execution = await prisma.execution.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends ExecutionUpdateArgs>(args: Prisma.SelectSubset<T, ExecutionUpdateArgs<ExtArgs>>): Prisma.Prisma__ExecutionClient<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Executions.
     * @param {ExecutionDeleteManyArgs} args - Arguments to filter Executions to delete.
     * @example
     * // Delete a few Executions
     * const { count } = await prisma.execution.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends ExecutionDeleteManyArgs>(args?: Prisma.SelectSubset<T, ExecutionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Executions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Executions
     * const execution = await prisma.execution.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends ExecutionUpdateManyArgs>(args: Prisma.SelectSubset<T, ExecutionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Executions and returns the data updated in the database.
     * @param {ExecutionUpdateManyAndReturnArgs} args - Arguments to update many Executions.
     * @example
     * // Update many Executions
     * const execution = await prisma.execution.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Executions and only return the `id`
     * const executionWithIdOnly = await prisma.execution.updateManyAndReturn({
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
    updateManyAndReturn<T extends ExecutionUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, ExecutionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Execution.
     * @param {ExecutionUpsertArgs} args - Arguments to update or create a Execution.
     * @example
     * // Update or create a Execution
     * const execution = await prisma.execution.upsert({
     *   create: {
     *     // ... data to create a Execution
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Execution we want to update
     *   }
     * })
     */
    upsert<T extends ExecutionUpsertArgs>(args: Prisma.SelectSubset<T, ExecutionUpsertArgs<ExtArgs>>): Prisma.Prisma__ExecutionClient<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Executions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionCountArgs} args - Arguments to filter Executions to count.
     * @example
     * // Count the number of Executions
     * const count = await prisma.execution.count({
     *   where: {
     *     // ... the filter for the Executions we want to count
     *   }
     * })
    **/
    count<T extends ExecutionCountArgs>(args?: Prisma.Subset<T, ExecutionCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], ExecutionCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Execution.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends ExecutionAggregateArgs>(args: Prisma.Subset<T, ExecutionAggregateArgs>): Prisma.PrismaPromise<GetExecutionAggregateType<T>>;
    /**
     * Group by Execution.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionGroupByArgs} args - Group by arguments.
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
    groupBy<T extends ExecutionGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: ExecutionGroupByArgs['orderBy'];
    } : {
        orderBy?: ExecutionGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, ExecutionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetExecutionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Execution model
     */
    readonly fields: ExecutionFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Execution.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__ExecutionClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    workflow<T extends Prisma.WorkflowDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.WorkflowDefaultArgs<ExtArgs>>): Prisma.Prisma__WorkflowClient<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
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
 * Fields of the Execution model
 */
export interface ExecutionFieldRefs {
    readonly id: Prisma.FieldRef<"Execution", 'String'>;
    readonly workflowId: Prisma.FieldRef<"Execution", 'String'>;
    readonly status: Prisma.FieldRef<"Execution", 'String'>;
    readonly mode: Prisma.FieldRef<"Execution", 'String'>;
    readonly startedAt: Prisma.FieldRef<"Execution", 'DateTime'>;
    readonly finishedAt: Prisma.FieldRef<"Execution", 'DateTime'>;
    readonly runData: Prisma.FieldRef<"Execution", 'String'>;
    readonly error: Prisma.FieldRef<"Execution", 'String'>;
}
/**
 * Execution findUnique
 */
export type ExecutionFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
    /**
     * Filter, which Execution to fetch.
     */
    where: Prisma.ExecutionWhereUniqueInput;
};
/**
 * Execution findUniqueOrThrow
 */
export type ExecutionFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
    /**
     * Filter, which Execution to fetch.
     */
    where: Prisma.ExecutionWhereUniqueInput;
};
/**
 * Execution findFirst
 */
export type ExecutionFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
    /**
     * Filter, which Execution to fetch.
     */
    where?: Prisma.ExecutionWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Executions to fetch.
     */
    orderBy?: Prisma.ExecutionOrderByWithRelationInput | Prisma.ExecutionOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Executions.
     */
    cursor?: Prisma.ExecutionWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Executions from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Executions.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Executions.
     */
    distinct?: Prisma.ExecutionScalarFieldEnum | Prisma.ExecutionScalarFieldEnum[];
};
/**
 * Execution findFirstOrThrow
 */
export type ExecutionFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
    /**
     * Filter, which Execution to fetch.
     */
    where?: Prisma.ExecutionWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Executions to fetch.
     */
    orderBy?: Prisma.ExecutionOrderByWithRelationInput | Prisma.ExecutionOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Executions.
     */
    cursor?: Prisma.ExecutionWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Executions from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Executions.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Executions.
     */
    distinct?: Prisma.ExecutionScalarFieldEnum | Prisma.ExecutionScalarFieldEnum[];
};
/**
 * Execution findMany
 */
export type ExecutionFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
    /**
     * Filter, which Executions to fetch.
     */
    where?: Prisma.ExecutionWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Executions to fetch.
     */
    orderBy?: Prisma.ExecutionOrderByWithRelationInput | Prisma.ExecutionOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Executions.
     */
    cursor?: Prisma.ExecutionWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Executions from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Executions.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Executions.
     */
    distinct?: Prisma.ExecutionScalarFieldEnum | Prisma.ExecutionScalarFieldEnum[];
};
/**
 * Execution create
 */
export type ExecutionCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
    /**
     * The data needed to create a Execution.
     */
    data: Prisma.XOR<Prisma.ExecutionCreateInput, Prisma.ExecutionUncheckedCreateInput>;
};
/**
 * Execution createMany
 */
export type ExecutionCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Executions.
     */
    data: Prisma.ExecutionCreateManyInput | Prisma.ExecutionCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Execution createManyAndReturn
 */
export type ExecutionCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * The data used to create many Executions.
     */
    data: Prisma.ExecutionCreateManyInput | Prisma.ExecutionCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * Execution update
 */
export type ExecutionUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
    /**
     * The data needed to update a Execution.
     */
    data: Prisma.XOR<Prisma.ExecutionUpdateInput, Prisma.ExecutionUncheckedUpdateInput>;
    /**
     * Choose, which Execution to update.
     */
    where: Prisma.ExecutionWhereUniqueInput;
};
/**
 * Execution updateMany
 */
export type ExecutionUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Executions.
     */
    data: Prisma.XOR<Prisma.ExecutionUpdateManyMutationInput, Prisma.ExecutionUncheckedUpdateManyInput>;
    /**
     * Filter which Executions to update
     */
    where?: Prisma.ExecutionWhereInput;
    /**
     * Limit how many Executions to update.
     */
    limit?: number;
};
/**
 * Execution updateManyAndReturn
 */
export type ExecutionUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * The data used to update Executions.
     */
    data: Prisma.XOR<Prisma.ExecutionUpdateManyMutationInput, Prisma.ExecutionUncheckedUpdateManyInput>;
    /**
     * Filter which Executions to update
     */
    where?: Prisma.ExecutionWhereInput;
    /**
     * Limit how many Executions to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * Execution upsert
 */
export type ExecutionUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
    /**
     * The filter to search for the Execution to update in case it exists.
     */
    where: Prisma.ExecutionWhereUniqueInput;
    /**
     * In case the Execution found by the `where` argument doesn't exist, create a new Execution with this data.
     */
    create: Prisma.XOR<Prisma.ExecutionCreateInput, Prisma.ExecutionUncheckedCreateInput>;
    /**
     * In case the Execution was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.ExecutionUpdateInput, Prisma.ExecutionUncheckedUpdateInput>;
};
/**
 * Execution delete
 */
export type ExecutionDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
    /**
     * Filter which Execution to delete.
     */
    where: Prisma.ExecutionWhereUniqueInput;
};
/**
 * Execution deleteMany
 */
export type ExecutionDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Executions to delete
     */
    where?: Prisma.ExecutionWhereInput;
    /**
     * Limit how many Executions to delete.
     */
    limit?: number;
};
/**
 * Execution without action
 */
export type ExecutionDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: Prisma.ExecutionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Execution
     */
    omit?: Prisma.ExecutionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ExecutionInclude<ExtArgs> | null;
};
