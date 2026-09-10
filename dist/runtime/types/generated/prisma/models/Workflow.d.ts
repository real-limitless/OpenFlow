import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model Workflow
 *
 */
export type WorkflowModel = runtime.Types.Result.DefaultSelection<Prisma.$WorkflowPayload>;
export type AggregateWorkflow = {
    _count: WorkflowCountAggregateOutputType | null;
    _min: WorkflowMinAggregateOutputType | null;
    _max: WorkflowMaxAggregateOutputType | null;
};
export type WorkflowMinAggregateOutputType = {
    id: string | null;
    userId: string | null;
    projectId: string | null;
    name: string | null;
    active: boolean | null;
    versionId: string | null;
    nodes: string | null;
    connections: string | null;
    settings: string | null;
    staticData: string | null;
    pinData: string | null;
    meta: string | null;
    extra: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type WorkflowMaxAggregateOutputType = {
    id: string | null;
    userId: string | null;
    projectId: string | null;
    name: string | null;
    active: boolean | null;
    versionId: string | null;
    nodes: string | null;
    connections: string | null;
    settings: string | null;
    staticData: string | null;
    pinData: string | null;
    meta: string | null;
    extra: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type WorkflowCountAggregateOutputType = {
    id: number;
    userId: number;
    projectId: number;
    name: number;
    active: number;
    versionId: number;
    nodes: number;
    connections: number;
    settings: number;
    staticData: number;
    pinData: number;
    meta: number;
    extra: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type WorkflowMinAggregateInputType = {
    id?: true;
    userId?: true;
    projectId?: true;
    name?: true;
    active?: true;
    versionId?: true;
    nodes?: true;
    connections?: true;
    settings?: true;
    staticData?: true;
    pinData?: true;
    meta?: true;
    extra?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type WorkflowMaxAggregateInputType = {
    id?: true;
    userId?: true;
    projectId?: true;
    name?: true;
    active?: true;
    versionId?: true;
    nodes?: true;
    connections?: true;
    settings?: true;
    staticData?: true;
    pinData?: true;
    meta?: true;
    extra?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type WorkflowCountAggregateInputType = {
    id?: true;
    userId?: true;
    projectId?: true;
    name?: true;
    active?: true;
    versionId?: true;
    nodes?: true;
    connections?: true;
    settings?: true;
    staticData?: true;
    pinData?: true;
    meta?: true;
    extra?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type WorkflowAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Workflow to aggregate.
     */
    where?: Prisma.WorkflowWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Workflows to fetch.
     */
    orderBy?: Prisma.WorkflowOrderByWithRelationInput | Prisma.WorkflowOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.WorkflowWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Workflows from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Workflows.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Workflows
    **/
    _count?: true | WorkflowCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: WorkflowMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: WorkflowMaxAggregateInputType;
};
export type GetWorkflowAggregateType<T extends WorkflowAggregateArgs> = {
    [P in keyof T & keyof AggregateWorkflow]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateWorkflow[P]> : Prisma.GetScalarType<T[P], AggregateWorkflow[P]>;
};
export type WorkflowGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.WorkflowWhereInput;
    orderBy?: Prisma.WorkflowOrderByWithAggregationInput | Prisma.WorkflowOrderByWithAggregationInput[];
    by: Prisma.WorkflowScalarFieldEnum[] | Prisma.WorkflowScalarFieldEnum;
    having?: Prisma.WorkflowScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: WorkflowCountAggregateInputType | true;
    _min?: WorkflowMinAggregateInputType;
    _max?: WorkflowMaxAggregateInputType;
};
export type WorkflowGroupByOutputType = {
    id: string;
    userId: string;
    projectId: string;
    name: string;
    active: boolean;
    versionId: string;
    nodes: string;
    connections: string;
    settings: string | null;
    staticData: string | null;
    pinData: string | null;
    meta: string | null;
    extra: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: WorkflowCountAggregateOutputType | null;
    _min: WorkflowMinAggregateOutputType | null;
    _max: WorkflowMaxAggregateOutputType | null;
};
export type GetWorkflowGroupByPayload<T extends WorkflowGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<WorkflowGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof WorkflowGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], WorkflowGroupByOutputType[P]> : Prisma.GetScalarType<T[P], WorkflowGroupByOutputType[P]>;
}>>;
export type WorkflowWhereInput = {
    AND?: Prisma.WorkflowWhereInput | Prisma.WorkflowWhereInput[];
    OR?: Prisma.WorkflowWhereInput[];
    NOT?: Prisma.WorkflowWhereInput | Prisma.WorkflowWhereInput[];
    id?: Prisma.StringFilter<"Workflow"> | string;
    userId?: Prisma.StringFilter<"Workflow"> | string;
    projectId?: Prisma.StringFilter<"Workflow"> | string;
    name?: Prisma.StringFilter<"Workflow"> | string;
    active?: Prisma.BoolFilter<"Workflow"> | boolean;
    versionId?: Prisma.StringFilter<"Workflow"> | string;
    nodes?: Prisma.StringFilter<"Workflow"> | string;
    connections?: Prisma.StringFilter<"Workflow"> | string;
    settings?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    staticData?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    pinData?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    meta?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    extra?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Workflow"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Workflow"> | Date | string;
    user?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
    project?: Prisma.XOR<Prisma.ProjectScalarRelationFilter, Prisma.ProjectWhereInput>;
    executions?: Prisma.ExecutionListRelationFilter;
    webhookRoutes?: Prisma.WebhookRouteListRelationFilter;
    scheduledTriggers?: Prisma.ScheduledTriggerListRelationFilter;
    formRoutes?: Prisma.FormRouteListRelationFilter;
};
export type WorkflowOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    versionId?: Prisma.SortOrder;
    nodes?: Prisma.SortOrder;
    connections?: Prisma.SortOrder;
    settings?: Prisma.SortOrderInput | Prisma.SortOrder;
    staticData?: Prisma.SortOrderInput | Prisma.SortOrder;
    pinData?: Prisma.SortOrderInput | Prisma.SortOrder;
    meta?: Prisma.SortOrderInput | Prisma.SortOrder;
    extra?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    user?: Prisma.UserOrderByWithRelationInput;
    project?: Prisma.ProjectOrderByWithRelationInput;
    executions?: Prisma.ExecutionOrderByRelationAggregateInput;
    webhookRoutes?: Prisma.WebhookRouteOrderByRelationAggregateInput;
    scheduledTriggers?: Prisma.ScheduledTriggerOrderByRelationAggregateInput;
    formRoutes?: Prisma.FormRouteOrderByRelationAggregateInput;
};
export type WorkflowWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.WorkflowWhereInput | Prisma.WorkflowWhereInput[];
    OR?: Prisma.WorkflowWhereInput[];
    NOT?: Prisma.WorkflowWhereInput | Prisma.WorkflowWhereInput[];
    userId?: Prisma.StringFilter<"Workflow"> | string;
    projectId?: Prisma.StringFilter<"Workflow"> | string;
    name?: Prisma.StringFilter<"Workflow"> | string;
    active?: Prisma.BoolFilter<"Workflow"> | boolean;
    versionId?: Prisma.StringFilter<"Workflow"> | string;
    nodes?: Prisma.StringFilter<"Workflow"> | string;
    connections?: Prisma.StringFilter<"Workflow"> | string;
    settings?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    staticData?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    pinData?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    meta?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    extra?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Workflow"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Workflow"> | Date | string;
    user?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
    project?: Prisma.XOR<Prisma.ProjectScalarRelationFilter, Prisma.ProjectWhereInput>;
    executions?: Prisma.ExecutionListRelationFilter;
    webhookRoutes?: Prisma.WebhookRouteListRelationFilter;
    scheduledTriggers?: Prisma.ScheduledTriggerListRelationFilter;
    formRoutes?: Prisma.FormRouteListRelationFilter;
}, "id">;
export type WorkflowOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    versionId?: Prisma.SortOrder;
    nodes?: Prisma.SortOrder;
    connections?: Prisma.SortOrder;
    settings?: Prisma.SortOrderInput | Prisma.SortOrder;
    staticData?: Prisma.SortOrderInput | Prisma.SortOrder;
    pinData?: Prisma.SortOrderInput | Prisma.SortOrder;
    meta?: Prisma.SortOrderInput | Prisma.SortOrder;
    extra?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.WorkflowCountOrderByAggregateInput;
    _max?: Prisma.WorkflowMaxOrderByAggregateInput;
    _min?: Prisma.WorkflowMinOrderByAggregateInput;
};
export type WorkflowScalarWhereWithAggregatesInput = {
    AND?: Prisma.WorkflowScalarWhereWithAggregatesInput | Prisma.WorkflowScalarWhereWithAggregatesInput[];
    OR?: Prisma.WorkflowScalarWhereWithAggregatesInput[];
    NOT?: Prisma.WorkflowScalarWhereWithAggregatesInput | Prisma.WorkflowScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Workflow"> | string;
    userId?: Prisma.StringWithAggregatesFilter<"Workflow"> | string;
    projectId?: Prisma.StringWithAggregatesFilter<"Workflow"> | string;
    name?: Prisma.StringWithAggregatesFilter<"Workflow"> | string;
    active?: Prisma.BoolWithAggregatesFilter<"Workflow"> | boolean;
    versionId?: Prisma.StringWithAggregatesFilter<"Workflow"> | string;
    nodes?: Prisma.StringWithAggregatesFilter<"Workflow"> | string;
    connections?: Prisma.StringWithAggregatesFilter<"Workflow"> | string;
    settings?: Prisma.StringNullableWithAggregatesFilter<"Workflow"> | string | null;
    staticData?: Prisma.StringNullableWithAggregatesFilter<"Workflow"> | string | null;
    pinData?: Prisma.StringNullableWithAggregatesFilter<"Workflow"> | string | null;
    meta?: Prisma.StringNullableWithAggregatesFilter<"Workflow"> | string | null;
    extra?: Prisma.StringNullableWithAggregatesFilter<"Workflow"> | string | null;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"Workflow"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"Workflow"> | Date | string;
};
export type WorkflowCreateInput = {
    id?: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutWorkflowsInput;
    project: Prisma.ProjectCreateNestedOneWithoutWorkflowsInput;
    executions?: Prisma.ExecutionCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowUncheckedCreateInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    executions?: Prisma.ExecutionUncheckedCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteUncheckedCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutWorkflowsNestedInput;
    project?: Prisma.ProjectUpdateOneRequiredWithoutWorkflowsNestedInput;
    executions?: Prisma.ExecutionUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executions?: Prisma.ExecutionUncheckedUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowCreateManyInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type WorkflowUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type WorkflowUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type WorkflowListRelationFilter = {
    every?: Prisma.WorkflowWhereInput;
    some?: Prisma.WorkflowWhereInput;
    none?: Prisma.WorkflowWhereInput;
};
export type WorkflowOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type WorkflowCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    versionId?: Prisma.SortOrder;
    nodes?: Prisma.SortOrder;
    connections?: Prisma.SortOrder;
    settings?: Prisma.SortOrder;
    staticData?: Prisma.SortOrder;
    pinData?: Prisma.SortOrder;
    meta?: Prisma.SortOrder;
    extra?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type WorkflowMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    versionId?: Prisma.SortOrder;
    nodes?: Prisma.SortOrder;
    connections?: Prisma.SortOrder;
    settings?: Prisma.SortOrder;
    staticData?: Prisma.SortOrder;
    pinData?: Prisma.SortOrder;
    meta?: Prisma.SortOrder;
    extra?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type WorkflowMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    versionId?: Prisma.SortOrder;
    nodes?: Prisma.SortOrder;
    connections?: Prisma.SortOrder;
    settings?: Prisma.SortOrder;
    staticData?: Prisma.SortOrder;
    pinData?: Prisma.SortOrder;
    meta?: Prisma.SortOrder;
    extra?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type WorkflowScalarRelationFilter = {
    is?: Prisma.WorkflowWhereInput;
    isNot?: Prisma.WorkflowWhereInput;
};
export type WorkflowCreateNestedManyWithoutUserInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutUserInput, Prisma.WorkflowUncheckedCreateWithoutUserInput> | Prisma.WorkflowCreateWithoutUserInput[] | Prisma.WorkflowUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutUserInput | Prisma.WorkflowCreateOrConnectWithoutUserInput[];
    createMany?: Prisma.WorkflowCreateManyUserInputEnvelope;
    connect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
};
export type WorkflowUncheckedCreateNestedManyWithoutUserInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutUserInput, Prisma.WorkflowUncheckedCreateWithoutUserInput> | Prisma.WorkflowCreateWithoutUserInput[] | Prisma.WorkflowUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutUserInput | Prisma.WorkflowCreateOrConnectWithoutUserInput[];
    createMany?: Prisma.WorkflowCreateManyUserInputEnvelope;
    connect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
};
export type WorkflowUpdateManyWithoutUserNestedInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutUserInput, Prisma.WorkflowUncheckedCreateWithoutUserInput> | Prisma.WorkflowCreateWithoutUserInput[] | Prisma.WorkflowUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutUserInput | Prisma.WorkflowCreateOrConnectWithoutUserInput[];
    upsert?: Prisma.WorkflowUpsertWithWhereUniqueWithoutUserInput | Prisma.WorkflowUpsertWithWhereUniqueWithoutUserInput[];
    createMany?: Prisma.WorkflowCreateManyUserInputEnvelope;
    set?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    disconnect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    delete?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    connect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    update?: Prisma.WorkflowUpdateWithWhereUniqueWithoutUserInput | Prisma.WorkflowUpdateWithWhereUniqueWithoutUserInput[];
    updateMany?: Prisma.WorkflowUpdateManyWithWhereWithoutUserInput | Prisma.WorkflowUpdateManyWithWhereWithoutUserInput[];
    deleteMany?: Prisma.WorkflowScalarWhereInput | Prisma.WorkflowScalarWhereInput[];
};
export type WorkflowUncheckedUpdateManyWithoutUserNestedInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutUserInput, Prisma.WorkflowUncheckedCreateWithoutUserInput> | Prisma.WorkflowCreateWithoutUserInput[] | Prisma.WorkflowUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutUserInput | Prisma.WorkflowCreateOrConnectWithoutUserInput[];
    upsert?: Prisma.WorkflowUpsertWithWhereUniqueWithoutUserInput | Prisma.WorkflowUpsertWithWhereUniqueWithoutUserInput[];
    createMany?: Prisma.WorkflowCreateManyUserInputEnvelope;
    set?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    disconnect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    delete?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    connect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    update?: Prisma.WorkflowUpdateWithWhereUniqueWithoutUserInput | Prisma.WorkflowUpdateWithWhereUniqueWithoutUserInput[];
    updateMany?: Prisma.WorkflowUpdateManyWithWhereWithoutUserInput | Prisma.WorkflowUpdateManyWithWhereWithoutUserInput[];
    deleteMany?: Prisma.WorkflowScalarWhereInput | Prisma.WorkflowScalarWhereInput[];
};
export type WorkflowCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutProjectInput, Prisma.WorkflowUncheckedCreateWithoutProjectInput> | Prisma.WorkflowCreateWithoutProjectInput[] | Prisma.WorkflowUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutProjectInput | Prisma.WorkflowCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.WorkflowCreateManyProjectInputEnvelope;
    connect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
};
export type WorkflowUncheckedCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutProjectInput, Prisma.WorkflowUncheckedCreateWithoutProjectInput> | Prisma.WorkflowCreateWithoutProjectInput[] | Prisma.WorkflowUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutProjectInput | Prisma.WorkflowCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.WorkflowCreateManyProjectInputEnvelope;
    connect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
};
export type WorkflowUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutProjectInput, Prisma.WorkflowUncheckedCreateWithoutProjectInput> | Prisma.WorkflowCreateWithoutProjectInput[] | Prisma.WorkflowUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutProjectInput | Prisma.WorkflowCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.WorkflowUpsertWithWhereUniqueWithoutProjectInput | Prisma.WorkflowUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.WorkflowCreateManyProjectInputEnvelope;
    set?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    disconnect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    delete?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    connect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    update?: Prisma.WorkflowUpdateWithWhereUniqueWithoutProjectInput | Prisma.WorkflowUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.WorkflowUpdateManyWithWhereWithoutProjectInput | Prisma.WorkflowUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.WorkflowScalarWhereInput | Prisma.WorkflowScalarWhereInput[];
};
export type WorkflowUncheckedUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutProjectInput, Prisma.WorkflowUncheckedCreateWithoutProjectInput> | Prisma.WorkflowCreateWithoutProjectInput[] | Prisma.WorkflowUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutProjectInput | Prisma.WorkflowCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.WorkflowUpsertWithWhereUniqueWithoutProjectInput | Prisma.WorkflowUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.WorkflowCreateManyProjectInputEnvelope;
    set?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    disconnect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    delete?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    connect?: Prisma.WorkflowWhereUniqueInput | Prisma.WorkflowWhereUniqueInput[];
    update?: Prisma.WorkflowUpdateWithWhereUniqueWithoutProjectInput | Prisma.WorkflowUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.WorkflowUpdateManyWithWhereWithoutProjectInput | Prisma.WorkflowUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.WorkflowScalarWhereInput | Prisma.WorkflowScalarWhereInput[];
};
export type WorkflowCreateNestedOneWithoutFormRoutesInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutFormRoutesInput, Prisma.WorkflowUncheckedCreateWithoutFormRoutesInput>;
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutFormRoutesInput;
    connect?: Prisma.WorkflowWhereUniqueInput;
};
export type WorkflowUpdateOneRequiredWithoutFormRoutesNestedInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutFormRoutesInput, Prisma.WorkflowUncheckedCreateWithoutFormRoutesInput>;
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutFormRoutesInput;
    upsert?: Prisma.WorkflowUpsertWithoutFormRoutesInput;
    connect?: Prisma.WorkflowWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.WorkflowUpdateToOneWithWhereWithoutFormRoutesInput, Prisma.WorkflowUpdateWithoutFormRoutesInput>, Prisma.WorkflowUncheckedUpdateWithoutFormRoutesInput>;
};
export type WorkflowCreateNestedOneWithoutExecutionsInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutExecutionsInput, Prisma.WorkflowUncheckedCreateWithoutExecutionsInput>;
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutExecutionsInput;
    connect?: Prisma.WorkflowWhereUniqueInput;
};
export type WorkflowUpdateOneRequiredWithoutExecutionsNestedInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutExecutionsInput, Prisma.WorkflowUncheckedCreateWithoutExecutionsInput>;
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutExecutionsInput;
    upsert?: Prisma.WorkflowUpsertWithoutExecutionsInput;
    connect?: Prisma.WorkflowWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.WorkflowUpdateToOneWithWhereWithoutExecutionsInput, Prisma.WorkflowUpdateWithoutExecutionsInput>, Prisma.WorkflowUncheckedUpdateWithoutExecutionsInput>;
};
export type WorkflowCreateNestedOneWithoutWebhookRoutesInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutWebhookRoutesInput, Prisma.WorkflowUncheckedCreateWithoutWebhookRoutesInput>;
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutWebhookRoutesInput;
    connect?: Prisma.WorkflowWhereUniqueInput;
};
export type WorkflowUpdateOneRequiredWithoutWebhookRoutesNestedInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutWebhookRoutesInput, Prisma.WorkflowUncheckedCreateWithoutWebhookRoutesInput>;
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutWebhookRoutesInput;
    upsert?: Prisma.WorkflowUpsertWithoutWebhookRoutesInput;
    connect?: Prisma.WorkflowWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.WorkflowUpdateToOneWithWhereWithoutWebhookRoutesInput, Prisma.WorkflowUpdateWithoutWebhookRoutesInput>, Prisma.WorkflowUncheckedUpdateWithoutWebhookRoutesInput>;
};
export type WorkflowCreateNestedOneWithoutScheduledTriggersInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutScheduledTriggersInput, Prisma.WorkflowUncheckedCreateWithoutScheduledTriggersInput>;
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutScheduledTriggersInput;
    connect?: Prisma.WorkflowWhereUniqueInput;
};
export type WorkflowUpdateOneRequiredWithoutScheduledTriggersNestedInput = {
    create?: Prisma.XOR<Prisma.WorkflowCreateWithoutScheduledTriggersInput, Prisma.WorkflowUncheckedCreateWithoutScheduledTriggersInput>;
    connectOrCreate?: Prisma.WorkflowCreateOrConnectWithoutScheduledTriggersInput;
    upsert?: Prisma.WorkflowUpsertWithoutScheduledTriggersInput;
    connect?: Prisma.WorkflowWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.WorkflowUpdateToOneWithWhereWithoutScheduledTriggersInput, Prisma.WorkflowUpdateWithoutScheduledTriggersInput>, Prisma.WorkflowUncheckedUpdateWithoutScheduledTriggersInput>;
};
export type WorkflowCreateWithoutUserInput = {
    id?: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    project: Prisma.ProjectCreateNestedOneWithoutWorkflowsInput;
    executions?: Prisma.ExecutionCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowUncheckedCreateWithoutUserInput = {
    id?: string;
    projectId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    executions?: Prisma.ExecutionUncheckedCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteUncheckedCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowCreateOrConnectWithoutUserInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutUserInput, Prisma.WorkflowUncheckedCreateWithoutUserInput>;
};
export type WorkflowCreateManyUserInputEnvelope = {
    data: Prisma.WorkflowCreateManyUserInput | Prisma.WorkflowCreateManyUserInput[];
    skipDuplicates?: boolean;
};
export type WorkflowUpsertWithWhereUniqueWithoutUserInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    update: Prisma.XOR<Prisma.WorkflowUpdateWithoutUserInput, Prisma.WorkflowUncheckedUpdateWithoutUserInput>;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutUserInput, Prisma.WorkflowUncheckedCreateWithoutUserInput>;
};
export type WorkflowUpdateWithWhereUniqueWithoutUserInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    data: Prisma.XOR<Prisma.WorkflowUpdateWithoutUserInput, Prisma.WorkflowUncheckedUpdateWithoutUserInput>;
};
export type WorkflowUpdateManyWithWhereWithoutUserInput = {
    where: Prisma.WorkflowScalarWhereInput;
    data: Prisma.XOR<Prisma.WorkflowUpdateManyMutationInput, Prisma.WorkflowUncheckedUpdateManyWithoutUserInput>;
};
export type WorkflowScalarWhereInput = {
    AND?: Prisma.WorkflowScalarWhereInput | Prisma.WorkflowScalarWhereInput[];
    OR?: Prisma.WorkflowScalarWhereInput[];
    NOT?: Prisma.WorkflowScalarWhereInput | Prisma.WorkflowScalarWhereInput[];
    id?: Prisma.StringFilter<"Workflow"> | string;
    userId?: Prisma.StringFilter<"Workflow"> | string;
    projectId?: Prisma.StringFilter<"Workflow"> | string;
    name?: Prisma.StringFilter<"Workflow"> | string;
    active?: Prisma.BoolFilter<"Workflow"> | boolean;
    versionId?: Prisma.StringFilter<"Workflow"> | string;
    nodes?: Prisma.StringFilter<"Workflow"> | string;
    connections?: Prisma.StringFilter<"Workflow"> | string;
    settings?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    staticData?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    pinData?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    meta?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    extra?: Prisma.StringNullableFilter<"Workflow"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Workflow"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Workflow"> | Date | string;
};
export type WorkflowCreateWithoutProjectInput = {
    id?: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutWorkflowsInput;
    executions?: Prisma.ExecutionCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowUncheckedCreateWithoutProjectInput = {
    id?: string;
    userId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    executions?: Prisma.ExecutionUncheckedCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteUncheckedCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowCreateOrConnectWithoutProjectInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutProjectInput, Prisma.WorkflowUncheckedCreateWithoutProjectInput>;
};
export type WorkflowCreateManyProjectInputEnvelope = {
    data: Prisma.WorkflowCreateManyProjectInput | Prisma.WorkflowCreateManyProjectInput[];
    skipDuplicates?: boolean;
};
export type WorkflowUpsertWithWhereUniqueWithoutProjectInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    update: Prisma.XOR<Prisma.WorkflowUpdateWithoutProjectInput, Prisma.WorkflowUncheckedUpdateWithoutProjectInput>;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutProjectInput, Prisma.WorkflowUncheckedCreateWithoutProjectInput>;
};
export type WorkflowUpdateWithWhereUniqueWithoutProjectInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    data: Prisma.XOR<Prisma.WorkflowUpdateWithoutProjectInput, Prisma.WorkflowUncheckedUpdateWithoutProjectInput>;
};
export type WorkflowUpdateManyWithWhereWithoutProjectInput = {
    where: Prisma.WorkflowScalarWhereInput;
    data: Prisma.XOR<Prisma.WorkflowUpdateManyMutationInput, Prisma.WorkflowUncheckedUpdateManyWithoutProjectInput>;
};
export type WorkflowCreateWithoutFormRoutesInput = {
    id?: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutWorkflowsInput;
    project: Prisma.ProjectCreateNestedOneWithoutWorkflowsInput;
    executions?: Prisma.ExecutionCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowUncheckedCreateWithoutFormRoutesInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    executions?: Prisma.ExecutionUncheckedCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowCreateOrConnectWithoutFormRoutesInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutFormRoutesInput, Prisma.WorkflowUncheckedCreateWithoutFormRoutesInput>;
};
export type WorkflowUpsertWithoutFormRoutesInput = {
    update: Prisma.XOR<Prisma.WorkflowUpdateWithoutFormRoutesInput, Prisma.WorkflowUncheckedUpdateWithoutFormRoutesInput>;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutFormRoutesInput, Prisma.WorkflowUncheckedCreateWithoutFormRoutesInput>;
    where?: Prisma.WorkflowWhereInput;
};
export type WorkflowUpdateToOneWithWhereWithoutFormRoutesInput = {
    where?: Prisma.WorkflowWhereInput;
    data: Prisma.XOR<Prisma.WorkflowUpdateWithoutFormRoutesInput, Prisma.WorkflowUncheckedUpdateWithoutFormRoutesInput>;
};
export type WorkflowUpdateWithoutFormRoutesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutWorkflowsNestedInput;
    project?: Prisma.ProjectUpdateOneRequiredWithoutWorkflowsNestedInput;
    executions?: Prisma.ExecutionUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowUncheckedUpdateWithoutFormRoutesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executions?: Prisma.ExecutionUncheckedUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowCreateWithoutExecutionsInput = {
    id?: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutWorkflowsInput;
    project: Prisma.ProjectCreateNestedOneWithoutWorkflowsInput;
    webhookRoutes?: Prisma.WebhookRouteCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowUncheckedCreateWithoutExecutionsInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    webhookRoutes?: Prisma.WebhookRouteUncheckedCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteUncheckedCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowCreateOrConnectWithoutExecutionsInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutExecutionsInput, Prisma.WorkflowUncheckedCreateWithoutExecutionsInput>;
};
export type WorkflowUpsertWithoutExecutionsInput = {
    update: Prisma.XOR<Prisma.WorkflowUpdateWithoutExecutionsInput, Prisma.WorkflowUncheckedUpdateWithoutExecutionsInput>;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutExecutionsInput, Prisma.WorkflowUncheckedCreateWithoutExecutionsInput>;
    where?: Prisma.WorkflowWhereInput;
};
export type WorkflowUpdateToOneWithWhereWithoutExecutionsInput = {
    where?: Prisma.WorkflowWhereInput;
    data: Prisma.XOR<Prisma.WorkflowUpdateWithoutExecutionsInput, Prisma.WorkflowUncheckedUpdateWithoutExecutionsInput>;
};
export type WorkflowUpdateWithoutExecutionsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutWorkflowsNestedInput;
    project?: Prisma.ProjectUpdateOneRequiredWithoutWorkflowsNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowUncheckedUpdateWithoutExecutionsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    webhookRoutes?: Prisma.WebhookRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowCreateWithoutWebhookRoutesInput = {
    id?: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutWorkflowsInput;
    project: Prisma.ProjectCreateNestedOneWithoutWorkflowsInput;
    executions?: Prisma.ExecutionCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowUncheckedCreateWithoutWebhookRoutesInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    executions?: Prisma.ExecutionUncheckedCreateNestedManyWithoutWorkflowInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteUncheckedCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowCreateOrConnectWithoutWebhookRoutesInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutWebhookRoutesInput, Prisma.WorkflowUncheckedCreateWithoutWebhookRoutesInput>;
};
export type WorkflowUpsertWithoutWebhookRoutesInput = {
    update: Prisma.XOR<Prisma.WorkflowUpdateWithoutWebhookRoutesInput, Prisma.WorkflowUncheckedUpdateWithoutWebhookRoutesInput>;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutWebhookRoutesInput, Prisma.WorkflowUncheckedCreateWithoutWebhookRoutesInput>;
    where?: Prisma.WorkflowWhereInput;
};
export type WorkflowUpdateToOneWithWhereWithoutWebhookRoutesInput = {
    where?: Prisma.WorkflowWhereInput;
    data: Prisma.XOR<Prisma.WorkflowUpdateWithoutWebhookRoutesInput, Prisma.WorkflowUncheckedUpdateWithoutWebhookRoutesInput>;
};
export type WorkflowUpdateWithoutWebhookRoutesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutWorkflowsNestedInput;
    project?: Prisma.ProjectUpdateOneRequiredWithoutWorkflowsNestedInput;
    executions?: Prisma.ExecutionUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowUncheckedUpdateWithoutWebhookRoutesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executions?: Prisma.ExecutionUncheckedUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowCreateWithoutScheduledTriggersInput = {
    id?: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutWorkflowsInput;
    project: Prisma.ProjectCreateNestedOneWithoutWorkflowsInput;
    executions?: Prisma.ExecutionCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowUncheckedCreateWithoutScheduledTriggersInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    executions?: Prisma.ExecutionUncheckedCreateNestedManyWithoutWorkflowInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedCreateNestedManyWithoutWorkflowInput;
    formRoutes?: Prisma.FormRouteUncheckedCreateNestedManyWithoutWorkflowInput;
};
export type WorkflowCreateOrConnectWithoutScheduledTriggersInput = {
    where: Prisma.WorkflowWhereUniqueInput;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutScheduledTriggersInput, Prisma.WorkflowUncheckedCreateWithoutScheduledTriggersInput>;
};
export type WorkflowUpsertWithoutScheduledTriggersInput = {
    update: Prisma.XOR<Prisma.WorkflowUpdateWithoutScheduledTriggersInput, Prisma.WorkflowUncheckedUpdateWithoutScheduledTriggersInput>;
    create: Prisma.XOR<Prisma.WorkflowCreateWithoutScheduledTriggersInput, Prisma.WorkflowUncheckedCreateWithoutScheduledTriggersInput>;
    where?: Prisma.WorkflowWhereInput;
};
export type WorkflowUpdateToOneWithWhereWithoutScheduledTriggersInput = {
    where?: Prisma.WorkflowWhereInput;
    data: Prisma.XOR<Prisma.WorkflowUpdateWithoutScheduledTriggersInput, Prisma.WorkflowUncheckedUpdateWithoutScheduledTriggersInput>;
};
export type WorkflowUpdateWithoutScheduledTriggersInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutWorkflowsNestedInput;
    project?: Prisma.ProjectUpdateOneRequiredWithoutWorkflowsNestedInput;
    executions?: Prisma.ExecutionUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowUncheckedUpdateWithoutScheduledTriggersInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executions?: Prisma.ExecutionUncheckedUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowCreateManyUserInput = {
    id?: string;
    projectId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type WorkflowUpdateWithoutUserInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    project?: Prisma.ProjectUpdateOneRequiredWithoutWorkflowsNestedInput;
    executions?: Prisma.ExecutionUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowUncheckedUpdateWithoutUserInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executions?: Prisma.ExecutionUncheckedUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowUncheckedUpdateManyWithoutUserInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type WorkflowCreateManyProjectInput = {
    id?: string;
    userId: string;
    name: string;
    active?: boolean;
    versionId: string;
    nodes?: string;
    connections?: string;
    settings?: string | null;
    staticData?: string | null;
    pinData?: string | null;
    meta?: string | null;
    extra?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type WorkflowUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutWorkflowsNestedInput;
    executions?: Prisma.ExecutionUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowUncheckedUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executions?: Prisma.ExecutionUncheckedUpdateManyWithoutWorkflowNestedInput;
    webhookRoutes?: Prisma.WebhookRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
    scheduledTriggers?: Prisma.ScheduledTriggerUncheckedUpdateManyWithoutWorkflowNestedInput;
    formRoutes?: Prisma.FormRouteUncheckedUpdateManyWithoutWorkflowNestedInput;
};
export type WorkflowUncheckedUpdateManyWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    versionId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodes?: Prisma.StringFieldUpdateOperationsInput | string;
    connections?: Prisma.StringFieldUpdateOperationsInput | string;
    settings?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    staticData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    pinData?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    meta?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    extra?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
/**
 * Count Type WorkflowCountOutputType
 */
export type WorkflowCountOutputType = {
    executions: number;
    webhookRoutes: number;
    scheduledTriggers: number;
    formRoutes: number;
};
export type WorkflowCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    executions?: boolean | WorkflowCountOutputTypeCountExecutionsArgs;
    webhookRoutes?: boolean | WorkflowCountOutputTypeCountWebhookRoutesArgs;
    scheduledTriggers?: boolean | WorkflowCountOutputTypeCountScheduledTriggersArgs;
    formRoutes?: boolean | WorkflowCountOutputTypeCountFormRoutesArgs;
};
/**
 * WorkflowCountOutputType without action
 */
export type WorkflowCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowCountOutputType
     */
    select?: Prisma.WorkflowCountOutputTypeSelect<ExtArgs> | null;
};
/**
 * WorkflowCountOutputType without action
 */
export type WorkflowCountOutputTypeCountExecutionsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ExecutionWhereInput;
};
/**
 * WorkflowCountOutputType without action
 */
export type WorkflowCountOutputTypeCountWebhookRoutesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.WebhookRouteWhereInput;
};
/**
 * WorkflowCountOutputType without action
 */
export type WorkflowCountOutputTypeCountScheduledTriggersArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ScheduledTriggerWhereInput;
};
/**
 * WorkflowCountOutputType without action
 */
export type WorkflowCountOutputTypeCountFormRoutesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.FormRouteWhereInput;
};
export type WorkflowSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    active?: boolean;
    versionId?: boolean;
    nodes?: boolean;
    connections?: boolean;
    settings?: boolean;
    staticData?: boolean;
    pinData?: boolean;
    meta?: boolean;
    extra?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    executions?: boolean | Prisma.Workflow$executionsArgs<ExtArgs>;
    webhookRoutes?: boolean | Prisma.Workflow$webhookRoutesArgs<ExtArgs>;
    scheduledTriggers?: boolean | Prisma.Workflow$scheduledTriggersArgs<ExtArgs>;
    formRoutes?: boolean | Prisma.Workflow$formRoutesArgs<ExtArgs>;
    _count?: boolean | Prisma.WorkflowCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["workflow"]>;
export type WorkflowSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    active?: boolean;
    versionId?: boolean;
    nodes?: boolean;
    connections?: boolean;
    settings?: boolean;
    staticData?: boolean;
    pinData?: boolean;
    meta?: boolean;
    extra?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["workflow"]>;
export type WorkflowSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    active?: boolean;
    versionId?: boolean;
    nodes?: boolean;
    connections?: boolean;
    settings?: boolean;
    staticData?: boolean;
    pinData?: boolean;
    meta?: boolean;
    extra?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["workflow"]>;
export type WorkflowSelectScalar = {
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    active?: boolean;
    versionId?: boolean;
    nodes?: boolean;
    connections?: boolean;
    settings?: boolean;
    staticData?: boolean;
    pinData?: boolean;
    meta?: boolean;
    extra?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type WorkflowOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "userId" | "projectId" | "name" | "active" | "versionId" | "nodes" | "connections" | "settings" | "staticData" | "pinData" | "meta" | "extra" | "createdAt" | "updatedAt", ExtArgs["result"]["workflow"]>;
export type WorkflowInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    executions?: boolean | Prisma.Workflow$executionsArgs<ExtArgs>;
    webhookRoutes?: boolean | Prisma.Workflow$webhookRoutesArgs<ExtArgs>;
    scheduledTriggers?: boolean | Prisma.Workflow$scheduledTriggersArgs<ExtArgs>;
    formRoutes?: boolean | Prisma.Workflow$formRoutesArgs<ExtArgs>;
    _count?: boolean | Prisma.WorkflowCountOutputTypeDefaultArgs<ExtArgs>;
};
export type WorkflowIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
};
export type WorkflowIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
};
export type $WorkflowPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Workflow";
    objects: {
        user: Prisma.$UserPayload<ExtArgs>;
        project: Prisma.$ProjectPayload<ExtArgs>;
        executions: Prisma.$ExecutionPayload<ExtArgs>[];
        webhookRoutes: Prisma.$WebhookRoutePayload<ExtArgs>[];
        scheduledTriggers: Prisma.$ScheduledTriggerPayload<ExtArgs>[];
        formRoutes: Prisma.$FormRoutePayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        userId: string;
        projectId: string;
        name: string;
        active: boolean;
        versionId: string;
        nodes: string;
        connections: string;
        settings: string | null;
        staticData: string | null;
        pinData: string | null;
        meta: string | null;
        extra: string | null;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["workflow"]>;
    composites: {};
};
export type WorkflowGetPayload<S extends boolean | null | undefined | WorkflowDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$WorkflowPayload, S>;
export type WorkflowCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<WorkflowFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: WorkflowCountAggregateInputType | true;
};
export interface WorkflowDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Workflow'];
        meta: {
            name: 'Workflow';
        };
    };
    /**
     * Find zero or one Workflow that matches the filter.
     * @param {WorkflowFindUniqueArgs} args - Arguments to find a Workflow
     * @example
     * // Get one Workflow
     * const workflow = await prisma.workflow.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkflowFindUniqueArgs>(args: Prisma.SelectSubset<T, WorkflowFindUniqueArgs<ExtArgs>>): Prisma.Prisma__WorkflowClient<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Workflow that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkflowFindUniqueOrThrowArgs} args - Arguments to find a Workflow
     * @example
     * // Get one Workflow
     * const workflow = await prisma.workflow.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkflowFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, WorkflowFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__WorkflowClient<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Workflow that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowFindFirstArgs} args - Arguments to find a Workflow
     * @example
     * // Get one Workflow
     * const workflow = await prisma.workflow.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkflowFindFirstArgs>(args?: Prisma.SelectSubset<T, WorkflowFindFirstArgs<ExtArgs>>): Prisma.Prisma__WorkflowClient<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Workflow that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowFindFirstOrThrowArgs} args - Arguments to find a Workflow
     * @example
     * // Get one Workflow
     * const workflow = await prisma.workflow.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkflowFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, WorkflowFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__WorkflowClient<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Workflows that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Workflows
     * const workflows = await prisma.workflow.findMany()
     *
     * // Get first 10 Workflows
     * const workflows = await prisma.workflow.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const workflowWithIdOnly = await prisma.workflow.findMany({ select: { id: true } })
     *
     */
    findMany<T extends WorkflowFindManyArgs>(args?: Prisma.SelectSubset<T, WorkflowFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Workflow.
     * @param {WorkflowCreateArgs} args - Arguments to create a Workflow.
     * @example
     * // Create one Workflow
     * const Workflow = await prisma.workflow.create({
     *   data: {
     *     // ... data to create a Workflow
     *   }
     * })
     *
     */
    create<T extends WorkflowCreateArgs>(args: Prisma.SelectSubset<T, WorkflowCreateArgs<ExtArgs>>): Prisma.Prisma__WorkflowClient<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Workflows.
     * @param {WorkflowCreateManyArgs} args - Arguments to create many Workflows.
     * @example
     * // Create many Workflows
     * const workflow = await prisma.workflow.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends WorkflowCreateManyArgs>(args?: Prisma.SelectSubset<T, WorkflowCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Workflows and returns the data saved in the database.
     * @param {WorkflowCreateManyAndReturnArgs} args - Arguments to create many Workflows.
     * @example
     * // Create many Workflows
     * const workflow = await prisma.workflow.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Workflows and only return the `id`
     * const workflowWithIdOnly = await prisma.workflow.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends WorkflowCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, WorkflowCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Workflow.
     * @param {WorkflowDeleteArgs} args - Arguments to delete one Workflow.
     * @example
     * // Delete one Workflow
     * const Workflow = await prisma.workflow.delete({
     *   where: {
     *     // ... filter to delete one Workflow
     *   }
     * })
     *
     */
    delete<T extends WorkflowDeleteArgs>(args: Prisma.SelectSubset<T, WorkflowDeleteArgs<ExtArgs>>): Prisma.Prisma__WorkflowClient<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Workflow.
     * @param {WorkflowUpdateArgs} args - Arguments to update one Workflow.
     * @example
     * // Update one Workflow
     * const workflow = await prisma.workflow.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends WorkflowUpdateArgs>(args: Prisma.SelectSubset<T, WorkflowUpdateArgs<ExtArgs>>): Prisma.Prisma__WorkflowClient<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Workflows.
     * @param {WorkflowDeleteManyArgs} args - Arguments to filter Workflows to delete.
     * @example
     * // Delete a few Workflows
     * const { count } = await prisma.workflow.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends WorkflowDeleteManyArgs>(args?: Prisma.SelectSubset<T, WorkflowDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Workflows.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Workflows
     * const workflow = await prisma.workflow.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends WorkflowUpdateManyArgs>(args: Prisma.SelectSubset<T, WorkflowUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Workflows and returns the data updated in the database.
     * @param {WorkflowUpdateManyAndReturnArgs} args - Arguments to update many Workflows.
     * @example
     * // Update many Workflows
     * const workflow = await prisma.workflow.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Workflows and only return the `id`
     * const workflowWithIdOnly = await prisma.workflow.updateManyAndReturn({
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
    updateManyAndReturn<T extends WorkflowUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, WorkflowUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Workflow.
     * @param {WorkflowUpsertArgs} args - Arguments to update or create a Workflow.
     * @example
     * // Update or create a Workflow
     * const workflow = await prisma.workflow.upsert({
     *   create: {
     *     // ... data to create a Workflow
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Workflow we want to update
     *   }
     * })
     */
    upsert<T extends WorkflowUpsertArgs>(args: Prisma.SelectSubset<T, WorkflowUpsertArgs<ExtArgs>>): Prisma.Prisma__WorkflowClient<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Workflows.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowCountArgs} args - Arguments to filter Workflows to count.
     * @example
     * // Count the number of Workflows
     * const count = await prisma.workflow.count({
     *   where: {
     *     // ... the filter for the Workflows we want to count
     *   }
     * })
    **/
    count<T extends WorkflowCountArgs>(args?: Prisma.Subset<T, WorkflowCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], WorkflowCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Workflow.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends WorkflowAggregateArgs>(args: Prisma.Subset<T, WorkflowAggregateArgs>): Prisma.PrismaPromise<GetWorkflowAggregateType<T>>;
    /**
     * Group by Workflow.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowGroupByArgs} args - Group by arguments.
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
    groupBy<T extends WorkflowGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: WorkflowGroupByArgs['orderBy'];
    } : {
        orderBy?: WorkflowGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, WorkflowGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkflowGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Workflow model
     */
    readonly fields: WorkflowFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Workflow.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__WorkflowClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    user<T extends Prisma.UserDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.UserDefaultArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    project<T extends Prisma.ProjectDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ProjectDefaultArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    executions<T extends Prisma.Workflow$executionsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Workflow$executionsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    webhookRoutes<T extends Prisma.Workflow$webhookRoutesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Workflow$webhookRoutesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    scheduledTriggers<T extends Prisma.Workflow$scheduledTriggersArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Workflow$scheduledTriggersArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ScheduledTriggerPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    formRoutes<T extends Prisma.Workflow$formRoutesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Workflow$formRoutesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
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
 * Fields of the Workflow model
 */
export interface WorkflowFieldRefs {
    readonly id: Prisma.FieldRef<"Workflow", 'String'>;
    readonly userId: Prisma.FieldRef<"Workflow", 'String'>;
    readonly projectId: Prisma.FieldRef<"Workflow", 'String'>;
    readonly name: Prisma.FieldRef<"Workflow", 'String'>;
    readonly active: Prisma.FieldRef<"Workflow", 'Boolean'>;
    readonly versionId: Prisma.FieldRef<"Workflow", 'String'>;
    readonly nodes: Prisma.FieldRef<"Workflow", 'String'>;
    readonly connections: Prisma.FieldRef<"Workflow", 'String'>;
    readonly settings: Prisma.FieldRef<"Workflow", 'String'>;
    readonly staticData: Prisma.FieldRef<"Workflow", 'String'>;
    readonly pinData: Prisma.FieldRef<"Workflow", 'String'>;
    readonly meta: Prisma.FieldRef<"Workflow", 'String'>;
    readonly extra: Prisma.FieldRef<"Workflow", 'String'>;
    readonly createdAt: Prisma.FieldRef<"Workflow", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"Workflow", 'DateTime'>;
}
/**
 * Workflow findUnique
 */
export type WorkflowFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
    /**
     * Filter, which Workflow to fetch.
     */
    where: Prisma.WorkflowWhereUniqueInput;
};
/**
 * Workflow findUniqueOrThrow
 */
export type WorkflowFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
    /**
     * Filter, which Workflow to fetch.
     */
    where: Prisma.WorkflowWhereUniqueInput;
};
/**
 * Workflow findFirst
 */
export type WorkflowFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
    /**
     * Filter, which Workflow to fetch.
     */
    where?: Prisma.WorkflowWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Workflows to fetch.
     */
    orderBy?: Prisma.WorkflowOrderByWithRelationInput | Prisma.WorkflowOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Workflows.
     */
    cursor?: Prisma.WorkflowWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Workflows from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Workflows.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Workflows.
     */
    distinct?: Prisma.WorkflowScalarFieldEnum | Prisma.WorkflowScalarFieldEnum[];
};
/**
 * Workflow findFirstOrThrow
 */
export type WorkflowFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
    /**
     * Filter, which Workflow to fetch.
     */
    where?: Prisma.WorkflowWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Workflows to fetch.
     */
    orderBy?: Prisma.WorkflowOrderByWithRelationInput | Prisma.WorkflowOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Workflows.
     */
    cursor?: Prisma.WorkflowWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Workflows from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Workflows.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Workflows.
     */
    distinct?: Prisma.WorkflowScalarFieldEnum | Prisma.WorkflowScalarFieldEnum[];
};
/**
 * Workflow findMany
 */
export type WorkflowFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
    /**
     * Filter, which Workflows to fetch.
     */
    where?: Prisma.WorkflowWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Workflows to fetch.
     */
    orderBy?: Prisma.WorkflowOrderByWithRelationInput | Prisma.WorkflowOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Workflows.
     */
    cursor?: Prisma.WorkflowWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Workflows from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Workflows.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Workflows.
     */
    distinct?: Prisma.WorkflowScalarFieldEnum | Prisma.WorkflowScalarFieldEnum[];
};
/**
 * Workflow create
 */
export type WorkflowCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
    /**
     * The data needed to create a Workflow.
     */
    data: Prisma.XOR<Prisma.WorkflowCreateInput, Prisma.WorkflowUncheckedCreateInput>;
};
/**
 * Workflow createMany
 */
export type WorkflowCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Workflows.
     */
    data: Prisma.WorkflowCreateManyInput | Prisma.WorkflowCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Workflow createManyAndReturn
 */
export type WorkflowCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * The data used to create many Workflows.
     */
    data: Prisma.WorkflowCreateManyInput | Prisma.WorkflowCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * Workflow update
 */
export type WorkflowUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
    /**
     * The data needed to update a Workflow.
     */
    data: Prisma.XOR<Prisma.WorkflowUpdateInput, Prisma.WorkflowUncheckedUpdateInput>;
    /**
     * Choose, which Workflow to update.
     */
    where: Prisma.WorkflowWhereUniqueInput;
};
/**
 * Workflow updateMany
 */
export type WorkflowUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Workflows.
     */
    data: Prisma.XOR<Prisma.WorkflowUpdateManyMutationInput, Prisma.WorkflowUncheckedUpdateManyInput>;
    /**
     * Filter which Workflows to update
     */
    where?: Prisma.WorkflowWhereInput;
    /**
     * Limit how many Workflows to update.
     */
    limit?: number;
};
/**
 * Workflow updateManyAndReturn
 */
export type WorkflowUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * The data used to update Workflows.
     */
    data: Prisma.XOR<Prisma.WorkflowUpdateManyMutationInput, Prisma.WorkflowUncheckedUpdateManyInput>;
    /**
     * Filter which Workflows to update
     */
    where?: Prisma.WorkflowWhereInput;
    /**
     * Limit how many Workflows to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * Workflow upsert
 */
export type WorkflowUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
    /**
     * The filter to search for the Workflow to update in case it exists.
     */
    where: Prisma.WorkflowWhereUniqueInput;
    /**
     * In case the Workflow found by the `where` argument doesn't exist, create a new Workflow with this data.
     */
    create: Prisma.XOR<Prisma.WorkflowCreateInput, Prisma.WorkflowUncheckedCreateInput>;
    /**
     * In case the Workflow was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.WorkflowUpdateInput, Prisma.WorkflowUncheckedUpdateInput>;
};
/**
 * Workflow delete
 */
export type WorkflowDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
    /**
     * Filter which Workflow to delete.
     */
    where: Prisma.WorkflowWhereUniqueInput;
};
/**
 * Workflow deleteMany
 */
export type WorkflowDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Workflows to delete
     */
    where?: Prisma.WorkflowWhereInput;
    /**
     * Limit how many Workflows to delete.
     */
    limit?: number;
};
/**
 * Workflow.executions
 */
export type Workflow$executionsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    where?: Prisma.ExecutionWhereInput;
    orderBy?: Prisma.ExecutionOrderByWithRelationInput | Prisma.ExecutionOrderByWithRelationInput[];
    cursor?: Prisma.ExecutionWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ExecutionScalarFieldEnum | Prisma.ExecutionScalarFieldEnum[];
};
/**
 * Workflow.webhookRoutes
 */
export type Workflow$webhookRoutesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WebhookRoute
     */
    select?: Prisma.WebhookRouteSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WebhookRoute
     */
    omit?: Prisma.WebhookRouteOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WebhookRouteInclude<ExtArgs> | null;
    where?: Prisma.WebhookRouteWhereInput;
    orderBy?: Prisma.WebhookRouteOrderByWithRelationInput | Prisma.WebhookRouteOrderByWithRelationInput[];
    cursor?: Prisma.WebhookRouteWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.WebhookRouteScalarFieldEnum | Prisma.WebhookRouteScalarFieldEnum[];
};
/**
 * Workflow.scheduledTriggers
 */
export type Workflow$scheduledTriggersArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    where?: Prisma.ScheduledTriggerWhereInput;
    orderBy?: Prisma.ScheduledTriggerOrderByWithRelationInput | Prisma.ScheduledTriggerOrderByWithRelationInput[];
    cursor?: Prisma.ScheduledTriggerWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ScheduledTriggerScalarFieldEnum | Prisma.ScheduledTriggerScalarFieldEnum[];
};
/**
 * Workflow.formRoutes
 */
export type Workflow$formRoutesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FormRoute
     */
    select?: Prisma.FormRouteSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the FormRoute
     */
    omit?: Prisma.FormRouteOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.FormRouteInclude<ExtArgs> | null;
    where?: Prisma.FormRouteWhereInput;
    orderBy?: Prisma.FormRouteOrderByWithRelationInput | Prisma.FormRouteOrderByWithRelationInput[];
    cursor?: Prisma.FormRouteWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.FormRouteScalarFieldEnum | Prisma.FormRouteScalarFieldEnum[];
};
/**
 * Workflow without action
 */
export type WorkflowDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: Prisma.WorkflowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Workflow
     */
    omit?: Prisma.WorkflowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WorkflowInclude<ExtArgs> | null;
};
