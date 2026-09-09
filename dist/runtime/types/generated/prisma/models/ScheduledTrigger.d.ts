import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model ScheduledTrigger
 *
 */
export type ScheduledTriggerModel = runtime.Types.Result.DefaultSelection<Prisma.$ScheduledTriggerPayload>;
export type AggregateScheduledTrigger = {
    _count: ScheduledTriggerCountAggregateOutputType | null;
    _min: ScheduledTriggerMinAggregateOutputType | null;
    _max: ScheduledTriggerMaxAggregateOutputType | null;
};
export type ScheduledTriggerMinAggregateOutputType = {
    id: string | null;
    workflowId: string | null;
    nodeId: string | null;
    cronExpr: string | null;
    active: boolean | null;
    lastRunAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type ScheduledTriggerMaxAggregateOutputType = {
    id: string | null;
    workflowId: string | null;
    nodeId: string | null;
    cronExpr: string | null;
    active: boolean | null;
    lastRunAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type ScheduledTriggerCountAggregateOutputType = {
    id: number;
    workflowId: number;
    nodeId: number;
    cronExpr: number;
    active: number;
    lastRunAt: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type ScheduledTriggerMinAggregateInputType = {
    id?: true;
    workflowId?: true;
    nodeId?: true;
    cronExpr?: true;
    active?: true;
    lastRunAt?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type ScheduledTriggerMaxAggregateInputType = {
    id?: true;
    workflowId?: true;
    nodeId?: true;
    cronExpr?: true;
    active?: true;
    lastRunAt?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type ScheduledTriggerCountAggregateInputType = {
    id?: true;
    workflowId?: true;
    nodeId?: true;
    cronExpr?: true;
    active?: true;
    lastRunAt?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type ScheduledTriggerAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which ScheduledTrigger to aggregate.
     */
    where?: Prisma.ScheduledTriggerWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ScheduledTriggers to fetch.
     */
    orderBy?: Prisma.ScheduledTriggerOrderByWithRelationInput | Prisma.ScheduledTriggerOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.ScheduledTriggerWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ScheduledTriggers from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ScheduledTriggers.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned ScheduledTriggers
    **/
    _count?: true | ScheduledTriggerCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: ScheduledTriggerMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: ScheduledTriggerMaxAggregateInputType;
};
export type GetScheduledTriggerAggregateType<T extends ScheduledTriggerAggregateArgs> = {
    [P in keyof T & keyof AggregateScheduledTrigger]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateScheduledTrigger[P]> : Prisma.GetScalarType<T[P], AggregateScheduledTrigger[P]>;
};
export type ScheduledTriggerGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ScheduledTriggerWhereInput;
    orderBy?: Prisma.ScheduledTriggerOrderByWithAggregationInput | Prisma.ScheduledTriggerOrderByWithAggregationInput[];
    by: Prisma.ScheduledTriggerScalarFieldEnum[] | Prisma.ScheduledTriggerScalarFieldEnum;
    having?: Prisma.ScheduledTriggerScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: ScheduledTriggerCountAggregateInputType | true;
    _min?: ScheduledTriggerMinAggregateInputType;
    _max?: ScheduledTriggerMaxAggregateInputType;
};
export type ScheduledTriggerGroupByOutputType = {
    id: string;
    workflowId: string;
    nodeId: string;
    cronExpr: string;
    active: boolean;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    _count: ScheduledTriggerCountAggregateOutputType | null;
    _min: ScheduledTriggerMinAggregateOutputType | null;
    _max: ScheduledTriggerMaxAggregateOutputType | null;
};
export type GetScheduledTriggerGroupByPayload<T extends ScheduledTriggerGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<ScheduledTriggerGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof ScheduledTriggerGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], ScheduledTriggerGroupByOutputType[P]> : Prisma.GetScalarType<T[P], ScheduledTriggerGroupByOutputType[P]>;
}>>;
export type ScheduledTriggerWhereInput = {
    AND?: Prisma.ScheduledTriggerWhereInput | Prisma.ScheduledTriggerWhereInput[];
    OR?: Prisma.ScheduledTriggerWhereInput[];
    NOT?: Prisma.ScheduledTriggerWhereInput | Prisma.ScheduledTriggerWhereInput[];
    id?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    workflowId?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    nodeId?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    cronExpr?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    active?: Prisma.BoolFilter<"ScheduledTrigger"> | boolean;
    lastRunAt?: Prisma.DateTimeNullableFilter<"ScheduledTrigger"> | Date | string | null;
    createdAt?: Prisma.DateTimeFilter<"ScheduledTrigger"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"ScheduledTrigger"> | Date | string;
    workflow?: Prisma.XOR<Prisma.WorkflowScalarRelationFilter, Prisma.WorkflowWhereInput>;
};
export type ScheduledTriggerOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    cronExpr?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    lastRunAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    workflow?: Prisma.WorkflowOrderByWithRelationInput;
};
export type ScheduledTriggerWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    workflowId_nodeId?: Prisma.ScheduledTriggerWorkflowIdNodeIdCompoundUniqueInput;
    AND?: Prisma.ScheduledTriggerWhereInput | Prisma.ScheduledTriggerWhereInput[];
    OR?: Prisma.ScheduledTriggerWhereInput[];
    NOT?: Prisma.ScheduledTriggerWhereInput | Prisma.ScheduledTriggerWhereInput[];
    workflowId?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    nodeId?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    cronExpr?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    active?: Prisma.BoolFilter<"ScheduledTrigger"> | boolean;
    lastRunAt?: Prisma.DateTimeNullableFilter<"ScheduledTrigger"> | Date | string | null;
    createdAt?: Prisma.DateTimeFilter<"ScheduledTrigger"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"ScheduledTrigger"> | Date | string;
    workflow?: Prisma.XOR<Prisma.WorkflowScalarRelationFilter, Prisma.WorkflowWhereInput>;
}, "id" | "workflowId_nodeId">;
export type ScheduledTriggerOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    cronExpr?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    lastRunAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.ScheduledTriggerCountOrderByAggregateInput;
    _max?: Prisma.ScheduledTriggerMaxOrderByAggregateInput;
    _min?: Prisma.ScheduledTriggerMinOrderByAggregateInput;
};
export type ScheduledTriggerScalarWhereWithAggregatesInput = {
    AND?: Prisma.ScheduledTriggerScalarWhereWithAggregatesInput | Prisma.ScheduledTriggerScalarWhereWithAggregatesInput[];
    OR?: Prisma.ScheduledTriggerScalarWhereWithAggregatesInput[];
    NOT?: Prisma.ScheduledTriggerScalarWhereWithAggregatesInput | Prisma.ScheduledTriggerScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"ScheduledTrigger"> | string;
    workflowId?: Prisma.StringWithAggregatesFilter<"ScheduledTrigger"> | string;
    nodeId?: Prisma.StringWithAggregatesFilter<"ScheduledTrigger"> | string;
    cronExpr?: Prisma.StringWithAggregatesFilter<"ScheduledTrigger"> | string;
    active?: Prisma.BoolWithAggregatesFilter<"ScheduledTrigger"> | boolean;
    lastRunAt?: Prisma.DateTimeNullableWithAggregatesFilter<"ScheduledTrigger"> | Date | string | null;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"ScheduledTrigger"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"ScheduledTrigger"> | Date | string;
};
export type ScheduledTriggerCreateInput = {
    id?: string;
    nodeId: string;
    cronExpr: string;
    active?: boolean;
    lastRunAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflow: Prisma.WorkflowCreateNestedOneWithoutScheduledTriggersInput;
};
export type ScheduledTriggerUncheckedCreateInput = {
    id?: string;
    workflowId: string;
    nodeId: string;
    cronExpr: string;
    active?: boolean;
    lastRunAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ScheduledTriggerUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    cronExpr?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    lastRunAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflow?: Prisma.WorkflowUpdateOneRequiredWithoutScheduledTriggersNestedInput;
};
export type ScheduledTriggerUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    workflowId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    cronExpr?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    lastRunAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ScheduledTriggerCreateManyInput = {
    id?: string;
    workflowId: string;
    nodeId: string;
    cronExpr: string;
    active?: boolean;
    lastRunAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ScheduledTriggerUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    cronExpr?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    lastRunAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ScheduledTriggerUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    workflowId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    cronExpr?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    lastRunAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ScheduledTriggerListRelationFilter = {
    every?: Prisma.ScheduledTriggerWhereInput;
    some?: Prisma.ScheduledTriggerWhereInput;
    none?: Prisma.ScheduledTriggerWhereInput;
};
export type ScheduledTriggerOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type ScheduledTriggerWorkflowIdNodeIdCompoundUniqueInput = {
    workflowId: string;
    nodeId: string;
};
export type ScheduledTriggerCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    cronExpr?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    lastRunAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ScheduledTriggerMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    cronExpr?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    lastRunAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ScheduledTriggerMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    cronExpr?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    lastRunAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ScheduledTriggerCreateNestedManyWithoutWorkflowInput = {
    create?: Prisma.XOR<Prisma.ScheduledTriggerCreateWithoutWorkflowInput, Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput> | Prisma.ScheduledTriggerCreateWithoutWorkflowInput[] | Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.ScheduledTriggerCreateOrConnectWithoutWorkflowInput | Prisma.ScheduledTriggerCreateOrConnectWithoutWorkflowInput[];
    createMany?: Prisma.ScheduledTriggerCreateManyWorkflowInputEnvelope;
    connect?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
};
export type ScheduledTriggerUncheckedCreateNestedManyWithoutWorkflowInput = {
    create?: Prisma.XOR<Prisma.ScheduledTriggerCreateWithoutWorkflowInput, Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput> | Prisma.ScheduledTriggerCreateWithoutWorkflowInput[] | Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.ScheduledTriggerCreateOrConnectWithoutWorkflowInput | Prisma.ScheduledTriggerCreateOrConnectWithoutWorkflowInput[];
    createMany?: Prisma.ScheduledTriggerCreateManyWorkflowInputEnvelope;
    connect?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
};
export type ScheduledTriggerUpdateManyWithoutWorkflowNestedInput = {
    create?: Prisma.XOR<Prisma.ScheduledTriggerCreateWithoutWorkflowInput, Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput> | Prisma.ScheduledTriggerCreateWithoutWorkflowInput[] | Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.ScheduledTriggerCreateOrConnectWithoutWorkflowInput | Prisma.ScheduledTriggerCreateOrConnectWithoutWorkflowInput[];
    upsert?: Prisma.ScheduledTriggerUpsertWithWhereUniqueWithoutWorkflowInput | Prisma.ScheduledTriggerUpsertWithWhereUniqueWithoutWorkflowInput[];
    createMany?: Prisma.ScheduledTriggerCreateManyWorkflowInputEnvelope;
    set?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
    disconnect?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
    delete?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
    connect?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
    update?: Prisma.ScheduledTriggerUpdateWithWhereUniqueWithoutWorkflowInput | Prisma.ScheduledTriggerUpdateWithWhereUniqueWithoutWorkflowInput[];
    updateMany?: Prisma.ScheduledTriggerUpdateManyWithWhereWithoutWorkflowInput | Prisma.ScheduledTriggerUpdateManyWithWhereWithoutWorkflowInput[];
    deleteMany?: Prisma.ScheduledTriggerScalarWhereInput | Prisma.ScheduledTriggerScalarWhereInput[];
};
export type ScheduledTriggerUncheckedUpdateManyWithoutWorkflowNestedInput = {
    create?: Prisma.XOR<Prisma.ScheduledTriggerCreateWithoutWorkflowInput, Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput> | Prisma.ScheduledTriggerCreateWithoutWorkflowInput[] | Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.ScheduledTriggerCreateOrConnectWithoutWorkflowInput | Prisma.ScheduledTriggerCreateOrConnectWithoutWorkflowInput[];
    upsert?: Prisma.ScheduledTriggerUpsertWithWhereUniqueWithoutWorkflowInput | Prisma.ScheduledTriggerUpsertWithWhereUniqueWithoutWorkflowInput[];
    createMany?: Prisma.ScheduledTriggerCreateManyWorkflowInputEnvelope;
    set?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
    disconnect?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
    delete?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
    connect?: Prisma.ScheduledTriggerWhereUniqueInput | Prisma.ScheduledTriggerWhereUniqueInput[];
    update?: Prisma.ScheduledTriggerUpdateWithWhereUniqueWithoutWorkflowInput | Prisma.ScheduledTriggerUpdateWithWhereUniqueWithoutWorkflowInput[];
    updateMany?: Prisma.ScheduledTriggerUpdateManyWithWhereWithoutWorkflowInput | Prisma.ScheduledTriggerUpdateManyWithWhereWithoutWorkflowInput[];
    deleteMany?: Prisma.ScheduledTriggerScalarWhereInput | Prisma.ScheduledTriggerScalarWhereInput[];
};
export type ScheduledTriggerCreateWithoutWorkflowInput = {
    id?: string;
    nodeId: string;
    cronExpr: string;
    active?: boolean;
    lastRunAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ScheduledTriggerUncheckedCreateWithoutWorkflowInput = {
    id?: string;
    nodeId: string;
    cronExpr: string;
    active?: boolean;
    lastRunAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ScheduledTriggerCreateOrConnectWithoutWorkflowInput = {
    where: Prisma.ScheduledTriggerWhereUniqueInput;
    create: Prisma.XOR<Prisma.ScheduledTriggerCreateWithoutWorkflowInput, Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput>;
};
export type ScheduledTriggerCreateManyWorkflowInputEnvelope = {
    data: Prisma.ScheduledTriggerCreateManyWorkflowInput | Prisma.ScheduledTriggerCreateManyWorkflowInput[];
    skipDuplicates?: boolean;
};
export type ScheduledTriggerUpsertWithWhereUniqueWithoutWorkflowInput = {
    where: Prisma.ScheduledTriggerWhereUniqueInput;
    update: Prisma.XOR<Prisma.ScheduledTriggerUpdateWithoutWorkflowInput, Prisma.ScheduledTriggerUncheckedUpdateWithoutWorkflowInput>;
    create: Prisma.XOR<Prisma.ScheduledTriggerCreateWithoutWorkflowInput, Prisma.ScheduledTriggerUncheckedCreateWithoutWorkflowInput>;
};
export type ScheduledTriggerUpdateWithWhereUniqueWithoutWorkflowInput = {
    where: Prisma.ScheduledTriggerWhereUniqueInput;
    data: Prisma.XOR<Prisma.ScheduledTriggerUpdateWithoutWorkflowInput, Prisma.ScheduledTriggerUncheckedUpdateWithoutWorkflowInput>;
};
export type ScheduledTriggerUpdateManyWithWhereWithoutWorkflowInput = {
    where: Prisma.ScheduledTriggerScalarWhereInput;
    data: Prisma.XOR<Prisma.ScheduledTriggerUpdateManyMutationInput, Prisma.ScheduledTriggerUncheckedUpdateManyWithoutWorkflowInput>;
};
export type ScheduledTriggerScalarWhereInput = {
    AND?: Prisma.ScheduledTriggerScalarWhereInput | Prisma.ScheduledTriggerScalarWhereInput[];
    OR?: Prisma.ScheduledTriggerScalarWhereInput[];
    NOT?: Prisma.ScheduledTriggerScalarWhereInput | Prisma.ScheduledTriggerScalarWhereInput[];
    id?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    workflowId?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    nodeId?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    cronExpr?: Prisma.StringFilter<"ScheduledTrigger"> | string;
    active?: Prisma.BoolFilter<"ScheduledTrigger"> | boolean;
    lastRunAt?: Prisma.DateTimeNullableFilter<"ScheduledTrigger"> | Date | string | null;
    createdAt?: Prisma.DateTimeFilter<"ScheduledTrigger"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"ScheduledTrigger"> | Date | string;
};
export type ScheduledTriggerCreateManyWorkflowInput = {
    id?: string;
    nodeId: string;
    cronExpr: string;
    active?: boolean;
    lastRunAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ScheduledTriggerUpdateWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    cronExpr?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    lastRunAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ScheduledTriggerUncheckedUpdateWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    cronExpr?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    lastRunAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ScheduledTriggerUncheckedUpdateManyWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    cronExpr?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    lastRunAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ScheduledTriggerSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    cronExpr?: boolean;
    active?: boolean;
    lastRunAt?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["scheduledTrigger"]>;
export type ScheduledTriggerSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    cronExpr?: boolean;
    active?: boolean;
    lastRunAt?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["scheduledTrigger"]>;
export type ScheduledTriggerSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    cronExpr?: boolean;
    active?: boolean;
    lastRunAt?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["scheduledTrigger"]>;
export type ScheduledTriggerSelectScalar = {
    id?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    cronExpr?: boolean;
    active?: boolean;
    lastRunAt?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type ScheduledTriggerOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "workflowId" | "nodeId" | "cronExpr" | "active" | "lastRunAt" | "createdAt" | "updatedAt", ExtArgs["result"]["scheduledTrigger"]>;
export type ScheduledTriggerInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type ScheduledTriggerIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type ScheduledTriggerIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type $ScheduledTriggerPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "ScheduledTrigger";
    objects: {
        workflow: Prisma.$WorkflowPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        workflowId: string;
        nodeId: string;
        cronExpr: string;
        active: boolean;
        lastRunAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["scheduledTrigger"]>;
    composites: {};
};
export type ScheduledTriggerGetPayload<S extends boolean | null | undefined | ScheduledTriggerDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload, S>;
export type ScheduledTriggerCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<ScheduledTriggerFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: ScheduledTriggerCountAggregateInputType | true;
};
export interface ScheduledTriggerDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['ScheduledTrigger'];
        meta: {
            name: 'ScheduledTrigger';
        };
    };
    /**
     * Find zero or one ScheduledTrigger that matches the filter.
     * @param {ScheduledTriggerFindUniqueArgs} args - Arguments to find a ScheduledTrigger
     * @example
     * // Get one ScheduledTrigger
     * const scheduledTrigger = await prisma.scheduledTrigger.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ScheduledTriggerFindUniqueArgs>(args: Prisma.SelectSubset<T, ScheduledTriggerFindUniqueArgs<ExtArgs>>): Prisma.Prisma__ScheduledTriggerClient<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one ScheduledTrigger that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ScheduledTriggerFindUniqueOrThrowArgs} args - Arguments to find a ScheduledTrigger
     * @example
     * // Get one ScheduledTrigger
     * const scheduledTrigger = await prisma.scheduledTrigger.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ScheduledTriggerFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, ScheduledTriggerFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__ScheduledTriggerClient<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first ScheduledTrigger that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ScheduledTriggerFindFirstArgs} args - Arguments to find a ScheduledTrigger
     * @example
     * // Get one ScheduledTrigger
     * const scheduledTrigger = await prisma.scheduledTrigger.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ScheduledTriggerFindFirstArgs>(args?: Prisma.SelectSubset<T, ScheduledTriggerFindFirstArgs<ExtArgs>>): Prisma.Prisma__ScheduledTriggerClient<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first ScheduledTrigger that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ScheduledTriggerFindFirstOrThrowArgs} args - Arguments to find a ScheduledTrigger
     * @example
     * // Get one ScheduledTrigger
     * const scheduledTrigger = await prisma.scheduledTrigger.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ScheduledTriggerFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, ScheduledTriggerFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__ScheduledTriggerClient<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more ScheduledTriggers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ScheduledTriggerFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ScheduledTriggers
     * const scheduledTriggers = await prisma.scheduledTrigger.findMany()
     *
     * // Get first 10 ScheduledTriggers
     * const scheduledTriggers = await prisma.scheduledTrigger.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const scheduledTriggerWithIdOnly = await prisma.scheduledTrigger.findMany({ select: { id: true } })
     *
     */
    findMany<T extends ScheduledTriggerFindManyArgs>(args?: Prisma.SelectSubset<T, ScheduledTriggerFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a ScheduledTrigger.
     * @param {ScheduledTriggerCreateArgs} args - Arguments to create a ScheduledTrigger.
     * @example
     * // Create one ScheduledTrigger
     * const ScheduledTrigger = await prisma.scheduledTrigger.create({
     *   data: {
     *     // ... data to create a ScheduledTrigger
     *   }
     * })
     *
     */
    create<T extends ScheduledTriggerCreateArgs>(args: Prisma.SelectSubset<T, ScheduledTriggerCreateArgs<ExtArgs>>): Prisma.Prisma__ScheduledTriggerClient<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many ScheduledTriggers.
     * @param {ScheduledTriggerCreateManyArgs} args - Arguments to create many ScheduledTriggers.
     * @example
     * // Create many ScheduledTriggers
     * const scheduledTrigger = await prisma.scheduledTrigger.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends ScheduledTriggerCreateManyArgs>(args?: Prisma.SelectSubset<T, ScheduledTriggerCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many ScheduledTriggers and returns the data saved in the database.
     * @param {ScheduledTriggerCreateManyAndReturnArgs} args - Arguments to create many ScheduledTriggers.
     * @example
     * // Create many ScheduledTriggers
     * const scheduledTrigger = await prisma.scheduledTrigger.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many ScheduledTriggers and only return the `id`
     * const scheduledTriggerWithIdOnly = await prisma.scheduledTrigger.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends ScheduledTriggerCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, ScheduledTriggerCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a ScheduledTrigger.
     * @param {ScheduledTriggerDeleteArgs} args - Arguments to delete one ScheduledTrigger.
     * @example
     * // Delete one ScheduledTrigger
     * const ScheduledTrigger = await prisma.scheduledTrigger.delete({
     *   where: {
     *     // ... filter to delete one ScheduledTrigger
     *   }
     * })
     *
     */
    delete<T extends ScheduledTriggerDeleteArgs>(args: Prisma.SelectSubset<T, ScheduledTriggerDeleteArgs<ExtArgs>>): Prisma.Prisma__ScheduledTriggerClient<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one ScheduledTrigger.
     * @param {ScheduledTriggerUpdateArgs} args - Arguments to update one ScheduledTrigger.
     * @example
     * // Update one ScheduledTrigger
     * const scheduledTrigger = await prisma.scheduledTrigger.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends ScheduledTriggerUpdateArgs>(args: Prisma.SelectSubset<T, ScheduledTriggerUpdateArgs<ExtArgs>>): Prisma.Prisma__ScheduledTriggerClient<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more ScheduledTriggers.
     * @param {ScheduledTriggerDeleteManyArgs} args - Arguments to filter ScheduledTriggers to delete.
     * @example
     * // Delete a few ScheduledTriggers
     * const { count } = await prisma.scheduledTrigger.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends ScheduledTriggerDeleteManyArgs>(args?: Prisma.SelectSubset<T, ScheduledTriggerDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more ScheduledTriggers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ScheduledTriggerUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ScheduledTriggers
     * const scheduledTrigger = await prisma.scheduledTrigger.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends ScheduledTriggerUpdateManyArgs>(args: Prisma.SelectSubset<T, ScheduledTriggerUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more ScheduledTriggers and returns the data updated in the database.
     * @param {ScheduledTriggerUpdateManyAndReturnArgs} args - Arguments to update many ScheduledTriggers.
     * @example
     * // Update many ScheduledTriggers
     * const scheduledTrigger = await prisma.scheduledTrigger.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more ScheduledTriggers and only return the `id`
     * const scheduledTriggerWithIdOnly = await prisma.scheduledTrigger.updateManyAndReturn({
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
    updateManyAndReturn<T extends ScheduledTriggerUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, ScheduledTriggerUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one ScheduledTrigger.
     * @param {ScheduledTriggerUpsertArgs} args - Arguments to update or create a ScheduledTrigger.
     * @example
     * // Update or create a ScheduledTrigger
     * const scheduledTrigger = await prisma.scheduledTrigger.upsert({
     *   create: {
     *     // ... data to create a ScheduledTrigger
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ScheduledTrigger we want to update
     *   }
     * })
     */
    upsert<T extends ScheduledTriggerUpsertArgs>(args: Prisma.SelectSubset<T, ScheduledTriggerUpsertArgs<ExtArgs>>): Prisma.Prisma__ScheduledTriggerClient<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of ScheduledTriggers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ScheduledTriggerCountArgs} args - Arguments to filter ScheduledTriggers to count.
     * @example
     * // Count the number of ScheduledTriggers
     * const count = await prisma.scheduledTrigger.count({
     *   where: {
     *     // ... the filter for the ScheduledTriggers we want to count
     *   }
     * })
    **/
    count<T extends ScheduledTriggerCountArgs>(args?: Prisma.Subset<T, ScheduledTriggerCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], ScheduledTriggerCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a ScheduledTrigger.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ScheduledTriggerAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends ScheduledTriggerAggregateArgs>(args: Prisma.Subset<T, ScheduledTriggerAggregateArgs>): Prisma.PrismaPromise<GetScheduledTriggerAggregateType<T>>;
    /**
     * Group by ScheduledTrigger.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ScheduledTriggerGroupByArgs} args - Group by arguments.
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
    groupBy<T extends ScheduledTriggerGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: ScheduledTriggerGroupByArgs['orderBy'];
    } : {
        orderBy?: ScheduledTriggerGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, ScheduledTriggerGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetScheduledTriggerGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the ScheduledTrigger model
     */
    readonly fields: ScheduledTriggerFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for ScheduledTrigger.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__ScheduledTriggerClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
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
 * Fields of the ScheduledTrigger model
 */
export interface ScheduledTriggerFieldRefs {
    readonly id: Prisma.FieldRef<"ScheduledTrigger", 'String'>;
    readonly workflowId: Prisma.FieldRef<"ScheduledTrigger", 'String'>;
    readonly nodeId: Prisma.FieldRef<"ScheduledTrigger", 'String'>;
    readonly cronExpr: Prisma.FieldRef<"ScheduledTrigger", 'String'>;
    readonly active: Prisma.FieldRef<"ScheduledTrigger", 'Boolean'>;
    readonly lastRunAt: Prisma.FieldRef<"ScheduledTrigger", 'DateTime'>;
    readonly createdAt: Prisma.FieldRef<"ScheduledTrigger", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"ScheduledTrigger", 'DateTime'>;
}
/**
 * ScheduledTrigger findUnique
 */
export type ScheduledTriggerFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
    /**
     * Filter, which ScheduledTrigger to fetch.
     */
    where: Prisma.ScheduledTriggerWhereUniqueInput;
};
/**
 * ScheduledTrigger findUniqueOrThrow
 */
export type ScheduledTriggerFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
    /**
     * Filter, which ScheduledTrigger to fetch.
     */
    where: Prisma.ScheduledTriggerWhereUniqueInput;
};
/**
 * ScheduledTrigger findFirst
 */
export type ScheduledTriggerFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
    /**
     * Filter, which ScheduledTrigger to fetch.
     */
    where?: Prisma.ScheduledTriggerWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ScheduledTriggers to fetch.
     */
    orderBy?: Prisma.ScheduledTriggerOrderByWithRelationInput | Prisma.ScheduledTriggerOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for ScheduledTriggers.
     */
    cursor?: Prisma.ScheduledTriggerWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ScheduledTriggers from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ScheduledTriggers.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of ScheduledTriggers.
     */
    distinct?: Prisma.ScheduledTriggerScalarFieldEnum | Prisma.ScheduledTriggerScalarFieldEnum[];
};
/**
 * ScheduledTrigger findFirstOrThrow
 */
export type ScheduledTriggerFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
    /**
     * Filter, which ScheduledTrigger to fetch.
     */
    where?: Prisma.ScheduledTriggerWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ScheduledTriggers to fetch.
     */
    orderBy?: Prisma.ScheduledTriggerOrderByWithRelationInput | Prisma.ScheduledTriggerOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for ScheduledTriggers.
     */
    cursor?: Prisma.ScheduledTriggerWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ScheduledTriggers from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ScheduledTriggers.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of ScheduledTriggers.
     */
    distinct?: Prisma.ScheduledTriggerScalarFieldEnum | Prisma.ScheduledTriggerScalarFieldEnum[];
};
/**
 * ScheduledTrigger findMany
 */
export type ScheduledTriggerFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
    /**
     * Filter, which ScheduledTriggers to fetch.
     */
    where?: Prisma.ScheduledTriggerWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ScheduledTriggers to fetch.
     */
    orderBy?: Prisma.ScheduledTriggerOrderByWithRelationInput | Prisma.ScheduledTriggerOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing ScheduledTriggers.
     */
    cursor?: Prisma.ScheduledTriggerWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ScheduledTriggers from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ScheduledTriggers.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of ScheduledTriggers.
     */
    distinct?: Prisma.ScheduledTriggerScalarFieldEnum | Prisma.ScheduledTriggerScalarFieldEnum[];
};
/**
 * ScheduledTrigger create
 */
export type ScheduledTriggerCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
    /**
     * The data needed to create a ScheduledTrigger.
     */
    data: Prisma.XOR<Prisma.ScheduledTriggerCreateInput, Prisma.ScheduledTriggerUncheckedCreateInput>;
};
/**
 * ScheduledTrigger createMany
 */
export type ScheduledTriggerCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many ScheduledTriggers.
     */
    data: Prisma.ScheduledTriggerCreateManyInput | Prisma.ScheduledTriggerCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * ScheduledTrigger createManyAndReturn
 */
export type ScheduledTriggerCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * The data used to create many ScheduledTriggers.
     */
    data: Prisma.ScheduledTriggerCreateManyInput | Prisma.ScheduledTriggerCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * ScheduledTrigger update
 */
export type ScheduledTriggerUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
    /**
     * The data needed to update a ScheduledTrigger.
     */
    data: Prisma.XOR<Prisma.ScheduledTriggerUpdateInput, Prisma.ScheduledTriggerUncheckedUpdateInput>;
    /**
     * Choose, which ScheduledTrigger to update.
     */
    where: Prisma.ScheduledTriggerWhereUniqueInput;
};
/**
 * ScheduledTrigger updateMany
 */
export type ScheduledTriggerUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update ScheduledTriggers.
     */
    data: Prisma.XOR<Prisma.ScheduledTriggerUpdateManyMutationInput, Prisma.ScheduledTriggerUncheckedUpdateManyInput>;
    /**
     * Filter which ScheduledTriggers to update
     */
    where?: Prisma.ScheduledTriggerWhereInput;
    /**
     * Limit how many ScheduledTriggers to update.
     */
    limit?: number;
};
/**
 * ScheduledTrigger updateManyAndReturn
 */
export type ScheduledTriggerUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * The data used to update ScheduledTriggers.
     */
    data: Prisma.XOR<Prisma.ScheduledTriggerUpdateManyMutationInput, Prisma.ScheduledTriggerUncheckedUpdateManyInput>;
    /**
     * Filter which ScheduledTriggers to update
     */
    where?: Prisma.ScheduledTriggerWhereInput;
    /**
     * Limit how many ScheduledTriggers to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * ScheduledTrigger upsert
 */
export type ScheduledTriggerUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
    /**
     * The filter to search for the ScheduledTrigger to update in case it exists.
     */
    where: Prisma.ScheduledTriggerWhereUniqueInput;
    /**
     * In case the ScheduledTrigger found by the `where` argument doesn't exist, create a new ScheduledTrigger with this data.
     */
    create: Prisma.XOR<Prisma.ScheduledTriggerCreateInput, Prisma.ScheduledTriggerUncheckedCreateInput>;
    /**
     * In case the ScheduledTrigger was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.ScheduledTriggerUpdateInput, Prisma.ScheduledTriggerUncheckedUpdateInput>;
};
/**
 * ScheduledTrigger delete
 */
export type ScheduledTriggerDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
    /**
     * Filter which ScheduledTrigger to delete.
     */
    where: Prisma.ScheduledTriggerWhereUniqueInput;
};
/**
 * ScheduledTrigger deleteMany
 */
export type ScheduledTriggerDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which ScheduledTriggers to delete
     */
    where?: Prisma.ScheduledTriggerWhereInput;
    /**
     * Limit how many ScheduledTriggers to delete.
     */
    limit?: number;
};
/**
 * ScheduledTrigger without action
 */
export type ScheduledTriggerDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ScheduledTrigger
     */
    select?: Prisma.ScheduledTriggerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ScheduledTrigger
     */
    omit?: Prisma.ScheduledTriggerOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ScheduledTriggerInclude<ExtArgs> | null;
};
