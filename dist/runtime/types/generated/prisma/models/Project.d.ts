import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model Project
 *
 */
export type ProjectModel = runtime.Types.Result.DefaultSelection<Prisma.$ProjectPayload>;
export type AggregateProject = {
    _count: ProjectCountAggregateOutputType | null;
    _min: ProjectMinAggregateOutputType | null;
    _max: ProjectMaxAggregateOutputType | null;
};
export type ProjectMinAggregateOutputType = {
    id: string | null;
    name: string | null;
    type: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type ProjectMaxAggregateOutputType = {
    id: string | null;
    name: string | null;
    type: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type ProjectCountAggregateOutputType = {
    id: number;
    name: number;
    type: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type ProjectMinAggregateInputType = {
    id?: true;
    name?: true;
    type?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type ProjectMaxAggregateInputType = {
    id?: true;
    name?: true;
    type?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type ProjectCountAggregateInputType = {
    id?: true;
    name?: true;
    type?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type ProjectAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Project to aggregate.
     */
    where?: Prisma.ProjectWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Projects to fetch.
     */
    orderBy?: Prisma.ProjectOrderByWithRelationInput | Prisma.ProjectOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.ProjectWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Projects from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Projects.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Projects
    **/
    _count?: true | ProjectCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: ProjectMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: ProjectMaxAggregateInputType;
};
export type GetProjectAggregateType<T extends ProjectAggregateArgs> = {
    [P in keyof T & keyof AggregateProject]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateProject[P]> : Prisma.GetScalarType<T[P], AggregateProject[P]>;
};
export type ProjectGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ProjectWhereInput;
    orderBy?: Prisma.ProjectOrderByWithAggregationInput | Prisma.ProjectOrderByWithAggregationInput[];
    by: Prisma.ProjectScalarFieldEnum[] | Prisma.ProjectScalarFieldEnum;
    having?: Prisma.ProjectScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: ProjectCountAggregateInputType | true;
    _min?: ProjectMinAggregateInputType;
    _max?: ProjectMaxAggregateInputType;
};
export type ProjectGroupByOutputType = {
    id: string;
    name: string;
    type: string;
    createdAt: Date;
    updatedAt: Date;
    _count: ProjectCountAggregateOutputType | null;
    _min: ProjectMinAggregateOutputType | null;
    _max: ProjectMaxAggregateOutputType | null;
};
export type GetProjectGroupByPayload<T extends ProjectGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<ProjectGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof ProjectGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], ProjectGroupByOutputType[P]> : Prisma.GetScalarType<T[P], ProjectGroupByOutputType[P]>;
}>>;
export type ProjectWhereInput = {
    AND?: Prisma.ProjectWhereInput | Prisma.ProjectWhereInput[];
    OR?: Prisma.ProjectWhereInput[];
    NOT?: Prisma.ProjectWhereInput | Prisma.ProjectWhereInput[];
    id?: Prisma.StringFilter<"Project"> | string;
    name?: Prisma.StringFilter<"Project"> | string;
    type?: Prisma.StringFilter<"Project"> | string;
    createdAt?: Prisma.DateTimeFilter<"Project"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Project"> | Date | string;
    members?: Prisma.ProjectMemberListRelationFilter;
    workflows?: Prisma.WorkflowListRelationFilter;
    credentials?: Prisma.CredentialListRelationFilter;
    dataTables?: Prisma.DataTableListRelationFilter;
    shares?: Prisma.ShareListRelationFilter;
    variables?: Prisma.VariableListRelationFilter;
    environments?: Prisma.EnvironmentListRelationFilter;
};
export type ProjectOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    members?: Prisma.ProjectMemberOrderByRelationAggregateInput;
    workflows?: Prisma.WorkflowOrderByRelationAggregateInput;
    credentials?: Prisma.CredentialOrderByRelationAggregateInput;
    dataTables?: Prisma.DataTableOrderByRelationAggregateInput;
    shares?: Prisma.ShareOrderByRelationAggregateInput;
    variables?: Prisma.VariableOrderByRelationAggregateInput;
    environments?: Prisma.EnvironmentOrderByRelationAggregateInput;
};
export type ProjectWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.ProjectWhereInput | Prisma.ProjectWhereInput[];
    OR?: Prisma.ProjectWhereInput[];
    NOT?: Prisma.ProjectWhereInput | Prisma.ProjectWhereInput[];
    name?: Prisma.StringFilter<"Project"> | string;
    type?: Prisma.StringFilter<"Project"> | string;
    createdAt?: Prisma.DateTimeFilter<"Project"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Project"> | Date | string;
    members?: Prisma.ProjectMemberListRelationFilter;
    workflows?: Prisma.WorkflowListRelationFilter;
    credentials?: Prisma.CredentialListRelationFilter;
    dataTables?: Prisma.DataTableListRelationFilter;
    shares?: Prisma.ShareListRelationFilter;
    variables?: Prisma.VariableListRelationFilter;
    environments?: Prisma.EnvironmentListRelationFilter;
}, "id">;
export type ProjectOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.ProjectCountOrderByAggregateInput;
    _max?: Prisma.ProjectMaxOrderByAggregateInput;
    _min?: Prisma.ProjectMinOrderByAggregateInput;
};
export type ProjectScalarWhereWithAggregatesInput = {
    AND?: Prisma.ProjectScalarWhereWithAggregatesInput | Prisma.ProjectScalarWhereWithAggregatesInput[];
    OR?: Prisma.ProjectScalarWhereWithAggregatesInput[];
    NOT?: Prisma.ProjectScalarWhereWithAggregatesInput | Prisma.ProjectScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Project"> | string;
    name?: Prisma.StringWithAggregatesFilter<"Project"> | string;
    type?: Prisma.StringWithAggregatesFilter<"Project"> | string;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"Project"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"Project"> | Date | string;
};
export type ProjectCreateInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentCreateNestedManyWithoutProjectInput;
};
export type ProjectUncheckedCreateInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableUncheckedCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentUncheckedCreateNestedManyWithoutProjectInput;
};
export type ProjectUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUpdateManyWithoutProjectNestedInput;
};
export type ProjectUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUncheckedUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUncheckedUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUncheckedUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUncheckedUpdateManyWithoutProjectNestedInput;
};
export type ProjectCreateManyInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ProjectUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ProjectUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ProjectCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ProjectMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ProjectMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ProjectNullableScalarRelationFilter = {
    is?: Prisma.ProjectWhereInput | null;
    isNot?: Prisma.ProjectWhereInput | null;
};
export type ProjectScalarRelationFilter = {
    is?: Prisma.ProjectWhereInput;
    isNot?: Prisma.ProjectWhereInput;
};
export type ProjectCreateNestedOneWithoutEnvironmentsInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutEnvironmentsInput, Prisma.ProjectUncheckedCreateWithoutEnvironmentsInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutEnvironmentsInput;
    connect?: Prisma.ProjectWhereUniqueInput;
};
export type ProjectUpdateOneWithoutEnvironmentsNestedInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutEnvironmentsInput, Prisma.ProjectUncheckedCreateWithoutEnvironmentsInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutEnvironmentsInput;
    upsert?: Prisma.ProjectUpsertWithoutEnvironmentsInput;
    disconnect?: Prisma.ProjectWhereInput | boolean;
    delete?: Prisma.ProjectWhereInput | boolean;
    connect?: Prisma.ProjectWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProjectUpdateToOneWithWhereWithoutEnvironmentsInput, Prisma.ProjectUpdateWithoutEnvironmentsInput>, Prisma.ProjectUncheckedUpdateWithoutEnvironmentsInput>;
};
export type ProjectCreateNestedOneWithoutVariablesInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutVariablesInput, Prisma.ProjectUncheckedCreateWithoutVariablesInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutVariablesInput;
    connect?: Prisma.ProjectWhereUniqueInput;
};
export type ProjectUpdateOneWithoutVariablesNestedInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutVariablesInput, Prisma.ProjectUncheckedCreateWithoutVariablesInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutVariablesInput;
    upsert?: Prisma.ProjectUpsertWithoutVariablesInput;
    disconnect?: Prisma.ProjectWhereInput | boolean;
    delete?: Prisma.ProjectWhereInput | boolean;
    connect?: Prisma.ProjectWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProjectUpdateToOneWithWhereWithoutVariablesInput, Prisma.ProjectUpdateWithoutVariablesInput>, Prisma.ProjectUncheckedUpdateWithoutVariablesInput>;
};
export type ProjectCreateNestedOneWithoutSharesInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutSharesInput, Prisma.ProjectUncheckedCreateWithoutSharesInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutSharesInput;
    connect?: Prisma.ProjectWhereUniqueInput;
};
export type ProjectUpdateOneWithoutSharesNestedInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutSharesInput, Prisma.ProjectUncheckedCreateWithoutSharesInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutSharesInput;
    upsert?: Prisma.ProjectUpsertWithoutSharesInput;
    disconnect?: Prisma.ProjectWhereInput | boolean;
    delete?: Prisma.ProjectWhereInput | boolean;
    connect?: Prisma.ProjectWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProjectUpdateToOneWithWhereWithoutSharesInput, Prisma.ProjectUpdateWithoutSharesInput>, Prisma.ProjectUncheckedUpdateWithoutSharesInput>;
};
export type ProjectCreateNestedOneWithoutMembersInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutMembersInput, Prisma.ProjectUncheckedCreateWithoutMembersInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutMembersInput;
    connect?: Prisma.ProjectWhereUniqueInput;
};
export type ProjectUpdateOneRequiredWithoutMembersNestedInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutMembersInput, Prisma.ProjectUncheckedCreateWithoutMembersInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutMembersInput;
    upsert?: Prisma.ProjectUpsertWithoutMembersInput;
    connect?: Prisma.ProjectWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProjectUpdateToOneWithWhereWithoutMembersInput, Prisma.ProjectUpdateWithoutMembersInput>, Prisma.ProjectUncheckedUpdateWithoutMembersInput>;
};
export type ProjectCreateNestedOneWithoutWorkflowsInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutWorkflowsInput, Prisma.ProjectUncheckedCreateWithoutWorkflowsInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutWorkflowsInput;
    connect?: Prisma.ProjectWhereUniqueInput;
};
export type ProjectUpdateOneRequiredWithoutWorkflowsNestedInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutWorkflowsInput, Prisma.ProjectUncheckedCreateWithoutWorkflowsInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutWorkflowsInput;
    upsert?: Prisma.ProjectUpsertWithoutWorkflowsInput;
    connect?: Prisma.ProjectWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProjectUpdateToOneWithWhereWithoutWorkflowsInput, Prisma.ProjectUpdateWithoutWorkflowsInput>, Prisma.ProjectUncheckedUpdateWithoutWorkflowsInput>;
};
export type ProjectCreateNestedOneWithoutCredentialsInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutCredentialsInput, Prisma.ProjectUncheckedCreateWithoutCredentialsInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutCredentialsInput;
    connect?: Prisma.ProjectWhereUniqueInput;
};
export type ProjectUpdateOneRequiredWithoutCredentialsNestedInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutCredentialsInput, Prisma.ProjectUncheckedCreateWithoutCredentialsInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutCredentialsInput;
    upsert?: Prisma.ProjectUpsertWithoutCredentialsInput;
    connect?: Prisma.ProjectWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProjectUpdateToOneWithWhereWithoutCredentialsInput, Prisma.ProjectUpdateWithoutCredentialsInput>, Prisma.ProjectUncheckedUpdateWithoutCredentialsInput>;
};
export type ProjectCreateNestedOneWithoutDataTablesInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutDataTablesInput, Prisma.ProjectUncheckedCreateWithoutDataTablesInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutDataTablesInput;
    connect?: Prisma.ProjectWhereUniqueInput;
};
export type ProjectUpdateOneRequiredWithoutDataTablesNestedInput = {
    create?: Prisma.XOR<Prisma.ProjectCreateWithoutDataTablesInput, Prisma.ProjectUncheckedCreateWithoutDataTablesInput>;
    connectOrCreate?: Prisma.ProjectCreateOrConnectWithoutDataTablesInput;
    upsert?: Prisma.ProjectUpsertWithoutDataTablesInput;
    connect?: Prisma.ProjectWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProjectUpdateToOneWithWhereWithoutDataTablesInput, Prisma.ProjectUpdateWithoutDataTablesInput>, Prisma.ProjectUncheckedUpdateWithoutDataTablesInput>;
};
export type ProjectCreateWithoutEnvironmentsInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableCreateNestedManyWithoutProjectInput;
};
export type ProjectUncheckedCreateWithoutEnvironmentsInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableUncheckedCreateNestedManyWithoutProjectInput;
};
export type ProjectCreateOrConnectWithoutEnvironmentsInput = {
    where: Prisma.ProjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutEnvironmentsInput, Prisma.ProjectUncheckedCreateWithoutEnvironmentsInput>;
};
export type ProjectUpsertWithoutEnvironmentsInput = {
    update: Prisma.XOR<Prisma.ProjectUpdateWithoutEnvironmentsInput, Prisma.ProjectUncheckedUpdateWithoutEnvironmentsInput>;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutEnvironmentsInput, Prisma.ProjectUncheckedCreateWithoutEnvironmentsInput>;
    where?: Prisma.ProjectWhereInput;
};
export type ProjectUpdateToOneWithWhereWithoutEnvironmentsInput = {
    where?: Prisma.ProjectWhereInput;
    data: Prisma.XOR<Prisma.ProjectUpdateWithoutEnvironmentsInput, Prisma.ProjectUncheckedUpdateWithoutEnvironmentsInput>;
};
export type ProjectUpdateWithoutEnvironmentsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUpdateManyWithoutProjectNestedInput;
};
export type ProjectUncheckedUpdateWithoutEnvironmentsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUncheckedUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUncheckedUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUncheckedUpdateManyWithoutProjectNestedInput;
};
export type ProjectCreateWithoutVariablesInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareCreateNestedManyWithoutGranteeProjectInput;
    environments?: Prisma.EnvironmentCreateNestedManyWithoutProjectInput;
};
export type ProjectUncheckedCreateWithoutVariablesInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeProjectInput;
    environments?: Prisma.EnvironmentUncheckedCreateNestedManyWithoutProjectInput;
};
export type ProjectCreateOrConnectWithoutVariablesInput = {
    where: Prisma.ProjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutVariablesInput, Prisma.ProjectUncheckedCreateWithoutVariablesInput>;
};
export type ProjectUpsertWithoutVariablesInput = {
    update: Prisma.XOR<Prisma.ProjectUpdateWithoutVariablesInput, Prisma.ProjectUncheckedUpdateWithoutVariablesInput>;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutVariablesInput, Prisma.ProjectUncheckedCreateWithoutVariablesInput>;
    where?: Prisma.ProjectWhereInput;
};
export type ProjectUpdateToOneWithWhereWithoutVariablesInput = {
    where?: Prisma.ProjectWhereInput;
    data: Prisma.XOR<Prisma.ProjectUpdateWithoutVariablesInput, Prisma.ProjectUncheckedUpdateWithoutVariablesInput>;
};
export type ProjectUpdateWithoutVariablesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUpdateManyWithoutGranteeProjectNestedInput;
    environments?: Prisma.EnvironmentUpdateManyWithoutProjectNestedInput;
};
export type ProjectUncheckedUpdateWithoutVariablesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUncheckedUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUncheckedUpdateManyWithoutGranteeProjectNestedInput;
    environments?: Prisma.EnvironmentUncheckedUpdateManyWithoutProjectNestedInput;
};
export type ProjectCreateWithoutSharesInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutProjectInput;
    variables?: Prisma.VariableCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentCreateNestedManyWithoutProjectInput;
};
export type ProjectUncheckedCreateWithoutSharesInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutProjectInput;
    variables?: Prisma.VariableUncheckedCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentUncheckedCreateNestedManyWithoutProjectInput;
};
export type ProjectCreateOrConnectWithoutSharesInput = {
    where: Prisma.ProjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutSharesInput, Prisma.ProjectUncheckedCreateWithoutSharesInput>;
};
export type ProjectUpsertWithoutSharesInput = {
    update: Prisma.XOR<Prisma.ProjectUpdateWithoutSharesInput, Prisma.ProjectUncheckedUpdateWithoutSharesInput>;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutSharesInput, Prisma.ProjectUncheckedCreateWithoutSharesInput>;
    where?: Prisma.ProjectWhereInput;
};
export type ProjectUpdateToOneWithWhereWithoutSharesInput = {
    where?: Prisma.ProjectWhereInput;
    data: Prisma.XOR<Prisma.ProjectUpdateWithoutSharesInput, Prisma.ProjectUncheckedUpdateWithoutSharesInput>;
};
export type ProjectUpdateWithoutSharesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutProjectNestedInput;
    variables?: Prisma.VariableUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUpdateManyWithoutProjectNestedInput;
};
export type ProjectUncheckedUpdateWithoutSharesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUncheckedUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutProjectNestedInput;
    variables?: Prisma.VariableUncheckedUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUncheckedUpdateManyWithoutProjectNestedInput;
};
export type ProjectCreateWithoutMembersInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentCreateNestedManyWithoutProjectInput;
};
export type ProjectUncheckedCreateWithoutMembersInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableUncheckedCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentUncheckedCreateNestedManyWithoutProjectInput;
};
export type ProjectCreateOrConnectWithoutMembersInput = {
    where: Prisma.ProjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutMembersInput, Prisma.ProjectUncheckedCreateWithoutMembersInput>;
};
export type ProjectUpsertWithoutMembersInput = {
    update: Prisma.XOR<Prisma.ProjectUpdateWithoutMembersInput, Prisma.ProjectUncheckedUpdateWithoutMembersInput>;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutMembersInput, Prisma.ProjectUncheckedCreateWithoutMembersInput>;
    where?: Prisma.ProjectWhereInput;
};
export type ProjectUpdateToOneWithWhereWithoutMembersInput = {
    where?: Prisma.ProjectWhereInput;
    data: Prisma.XOR<Prisma.ProjectUpdateWithoutMembersInput, Prisma.ProjectUncheckedUpdateWithoutMembersInput>;
};
export type ProjectUpdateWithoutMembersInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUpdateManyWithoutProjectNestedInput;
};
export type ProjectUncheckedUpdateWithoutMembersInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUncheckedUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUncheckedUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUncheckedUpdateManyWithoutProjectNestedInput;
};
export type ProjectCreateWithoutWorkflowsInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentCreateNestedManyWithoutProjectInput;
};
export type ProjectUncheckedCreateWithoutWorkflowsInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableUncheckedCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentUncheckedCreateNestedManyWithoutProjectInput;
};
export type ProjectCreateOrConnectWithoutWorkflowsInput = {
    where: Prisma.ProjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutWorkflowsInput, Prisma.ProjectUncheckedCreateWithoutWorkflowsInput>;
};
export type ProjectUpsertWithoutWorkflowsInput = {
    update: Prisma.XOR<Prisma.ProjectUpdateWithoutWorkflowsInput, Prisma.ProjectUncheckedUpdateWithoutWorkflowsInput>;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutWorkflowsInput, Prisma.ProjectUncheckedCreateWithoutWorkflowsInput>;
    where?: Prisma.ProjectWhereInput;
};
export type ProjectUpdateToOneWithWhereWithoutWorkflowsInput = {
    where?: Prisma.ProjectWhereInput;
    data: Prisma.XOR<Prisma.ProjectUpdateWithoutWorkflowsInput, Prisma.ProjectUncheckedUpdateWithoutWorkflowsInput>;
};
export type ProjectUpdateWithoutWorkflowsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUpdateManyWithoutProjectNestedInput;
};
export type ProjectUncheckedUpdateWithoutWorkflowsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUncheckedUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUncheckedUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUncheckedUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUncheckedUpdateManyWithoutProjectNestedInput;
};
export type ProjectCreateWithoutCredentialsInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentCreateNestedManyWithoutProjectInput;
};
export type ProjectUncheckedCreateWithoutCredentialsInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutProjectInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableUncheckedCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentUncheckedCreateNestedManyWithoutProjectInput;
};
export type ProjectCreateOrConnectWithoutCredentialsInput = {
    where: Prisma.ProjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutCredentialsInput, Prisma.ProjectUncheckedCreateWithoutCredentialsInput>;
};
export type ProjectUpsertWithoutCredentialsInput = {
    update: Prisma.XOR<Prisma.ProjectUpdateWithoutCredentialsInput, Prisma.ProjectUncheckedUpdateWithoutCredentialsInput>;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutCredentialsInput, Prisma.ProjectUncheckedCreateWithoutCredentialsInput>;
    where?: Prisma.ProjectWhereInput;
};
export type ProjectUpdateToOneWithWhereWithoutCredentialsInput = {
    where?: Prisma.ProjectWhereInput;
    data: Prisma.XOR<Prisma.ProjectUpdateWithoutCredentialsInput, Prisma.ProjectUncheckedUpdateWithoutCredentialsInput>;
};
export type ProjectUpdateWithoutCredentialsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUpdateManyWithoutProjectNestedInput;
};
export type ProjectUncheckedUpdateWithoutCredentialsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUncheckedUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutProjectNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUncheckedUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUncheckedUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUncheckedUpdateManyWithoutProjectNestedInput;
};
export type ProjectCreateWithoutDataTablesInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentCreateNestedManyWithoutProjectInput;
};
export type ProjectUncheckedCreateWithoutDataTablesInput = {
    id?: string;
    name: string;
    type?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    members?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutProjectInput;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutProjectInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutProjectInput;
    shares?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeProjectInput;
    variables?: Prisma.VariableUncheckedCreateNestedManyWithoutProjectInput;
    environments?: Prisma.EnvironmentUncheckedCreateNestedManyWithoutProjectInput;
};
export type ProjectCreateOrConnectWithoutDataTablesInput = {
    where: Prisma.ProjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutDataTablesInput, Prisma.ProjectUncheckedCreateWithoutDataTablesInput>;
};
export type ProjectUpsertWithoutDataTablesInput = {
    update: Prisma.XOR<Prisma.ProjectUpdateWithoutDataTablesInput, Prisma.ProjectUncheckedUpdateWithoutDataTablesInput>;
    create: Prisma.XOR<Prisma.ProjectCreateWithoutDataTablesInput, Prisma.ProjectUncheckedCreateWithoutDataTablesInput>;
    where?: Prisma.ProjectWhereInput;
};
export type ProjectUpdateToOneWithWhereWithoutDataTablesInput = {
    where?: Prisma.ProjectWhereInput;
    data: Prisma.XOR<Prisma.ProjectUpdateWithoutDataTablesInput, Prisma.ProjectUncheckedUpdateWithoutDataTablesInput>;
};
export type ProjectUpdateWithoutDataTablesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUpdateManyWithoutProjectNestedInput;
};
export type ProjectUncheckedUpdateWithoutDataTablesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    members?: Prisma.ProjectMemberUncheckedUpdateManyWithoutProjectNestedInput;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutProjectNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutProjectNestedInput;
    shares?: Prisma.ShareUncheckedUpdateManyWithoutGranteeProjectNestedInput;
    variables?: Prisma.VariableUncheckedUpdateManyWithoutProjectNestedInput;
    environments?: Prisma.EnvironmentUncheckedUpdateManyWithoutProjectNestedInput;
};
/**
 * Count Type ProjectCountOutputType
 */
export type ProjectCountOutputType = {
    members: number;
    workflows: number;
    credentials: number;
    dataTables: number;
    shares: number;
    variables: number;
    environments: number;
};
export type ProjectCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    members?: boolean | ProjectCountOutputTypeCountMembersArgs;
    workflows?: boolean | ProjectCountOutputTypeCountWorkflowsArgs;
    credentials?: boolean | ProjectCountOutputTypeCountCredentialsArgs;
    dataTables?: boolean | ProjectCountOutputTypeCountDataTablesArgs;
    shares?: boolean | ProjectCountOutputTypeCountSharesArgs;
    variables?: boolean | ProjectCountOutputTypeCountVariablesArgs;
    environments?: boolean | ProjectCountOutputTypeCountEnvironmentsArgs;
};
/**
 * ProjectCountOutputType without action
 */
export type ProjectCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProjectCountOutputType
     */
    select?: Prisma.ProjectCountOutputTypeSelect<ExtArgs> | null;
};
/**
 * ProjectCountOutputType without action
 */
export type ProjectCountOutputTypeCountMembersArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ProjectMemberWhereInput;
};
/**
 * ProjectCountOutputType without action
 */
export type ProjectCountOutputTypeCountWorkflowsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.WorkflowWhereInput;
};
/**
 * ProjectCountOutputType without action
 */
export type ProjectCountOutputTypeCountCredentialsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.CredentialWhereInput;
};
/**
 * ProjectCountOutputType without action
 */
export type ProjectCountOutputTypeCountDataTablesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.DataTableWhereInput;
};
/**
 * ProjectCountOutputType without action
 */
export type ProjectCountOutputTypeCountSharesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ShareWhereInput;
};
/**
 * ProjectCountOutputType without action
 */
export type ProjectCountOutputTypeCountVariablesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.VariableWhereInput;
};
/**
 * ProjectCountOutputType without action
 */
export type ProjectCountOutputTypeCountEnvironmentsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.EnvironmentWhereInput;
};
export type ProjectSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    type?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    members?: boolean | Prisma.Project$membersArgs<ExtArgs>;
    workflows?: boolean | Prisma.Project$workflowsArgs<ExtArgs>;
    credentials?: boolean | Prisma.Project$credentialsArgs<ExtArgs>;
    dataTables?: boolean | Prisma.Project$dataTablesArgs<ExtArgs>;
    shares?: boolean | Prisma.Project$sharesArgs<ExtArgs>;
    variables?: boolean | Prisma.Project$variablesArgs<ExtArgs>;
    environments?: boolean | Prisma.Project$environmentsArgs<ExtArgs>;
    _count?: boolean | Prisma.ProjectCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["project"]>;
export type ProjectSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    type?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["project"]>;
export type ProjectSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    type?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["project"]>;
export type ProjectSelectScalar = {
    id?: boolean;
    name?: boolean;
    type?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type ProjectOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "name" | "type" | "createdAt" | "updatedAt", ExtArgs["result"]["project"]>;
export type ProjectInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    members?: boolean | Prisma.Project$membersArgs<ExtArgs>;
    workflows?: boolean | Prisma.Project$workflowsArgs<ExtArgs>;
    credentials?: boolean | Prisma.Project$credentialsArgs<ExtArgs>;
    dataTables?: boolean | Prisma.Project$dataTablesArgs<ExtArgs>;
    shares?: boolean | Prisma.Project$sharesArgs<ExtArgs>;
    variables?: boolean | Prisma.Project$variablesArgs<ExtArgs>;
    environments?: boolean | Prisma.Project$environmentsArgs<ExtArgs>;
    _count?: boolean | Prisma.ProjectCountOutputTypeDefaultArgs<ExtArgs>;
};
export type ProjectIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type ProjectIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type $ProjectPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Project";
    objects: {
        members: Prisma.$ProjectMemberPayload<ExtArgs>[];
        workflows: Prisma.$WorkflowPayload<ExtArgs>[];
        credentials: Prisma.$CredentialPayload<ExtArgs>[];
        dataTables: Prisma.$DataTablePayload<ExtArgs>[];
        shares: Prisma.$SharePayload<ExtArgs>[];
        variables: Prisma.$VariablePayload<ExtArgs>[];
        environments: Prisma.$EnvironmentPayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        name: string;
        /**
         * personal | team
         */
        type: string;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["project"]>;
    composites: {};
};
export type ProjectGetPayload<S extends boolean | null | undefined | ProjectDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$ProjectPayload, S>;
export type ProjectCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<ProjectFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: ProjectCountAggregateInputType | true;
};
export interface ProjectDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Project'];
        meta: {
            name: 'Project';
        };
    };
    /**
     * Find zero or one Project that matches the filter.
     * @param {ProjectFindUniqueArgs} args - Arguments to find a Project
     * @example
     * // Get one Project
     * const project = await prisma.project.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ProjectFindUniqueArgs>(args: Prisma.SelectSubset<T, ProjectFindUniqueArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Project that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ProjectFindUniqueOrThrowArgs} args - Arguments to find a Project
     * @example
     * // Get one Project
     * const project = await prisma.project.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ProjectFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, ProjectFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Project that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectFindFirstArgs} args - Arguments to find a Project
     * @example
     * // Get one Project
     * const project = await prisma.project.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ProjectFindFirstArgs>(args?: Prisma.SelectSubset<T, ProjectFindFirstArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Project that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectFindFirstOrThrowArgs} args - Arguments to find a Project
     * @example
     * // Get one Project
     * const project = await prisma.project.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ProjectFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, ProjectFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Projects that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Projects
     * const projects = await prisma.project.findMany()
     *
     * // Get first 10 Projects
     * const projects = await prisma.project.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const projectWithIdOnly = await prisma.project.findMany({ select: { id: true } })
     *
     */
    findMany<T extends ProjectFindManyArgs>(args?: Prisma.SelectSubset<T, ProjectFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Project.
     * @param {ProjectCreateArgs} args - Arguments to create a Project.
     * @example
     * // Create one Project
     * const Project = await prisma.project.create({
     *   data: {
     *     // ... data to create a Project
     *   }
     * })
     *
     */
    create<T extends ProjectCreateArgs>(args: Prisma.SelectSubset<T, ProjectCreateArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Projects.
     * @param {ProjectCreateManyArgs} args - Arguments to create many Projects.
     * @example
     * // Create many Projects
     * const project = await prisma.project.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends ProjectCreateManyArgs>(args?: Prisma.SelectSubset<T, ProjectCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Projects and returns the data saved in the database.
     * @param {ProjectCreateManyAndReturnArgs} args - Arguments to create many Projects.
     * @example
     * // Create many Projects
     * const project = await prisma.project.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Projects and only return the `id`
     * const projectWithIdOnly = await prisma.project.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends ProjectCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, ProjectCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Project.
     * @param {ProjectDeleteArgs} args - Arguments to delete one Project.
     * @example
     * // Delete one Project
     * const Project = await prisma.project.delete({
     *   where: {
     *     // ... filter to delete one Project
     *   }
     * })
     *
     */
    delete<T extends ProjectDeleteArgs>(args: Prisma.SelectSubset<T, ProjectDeleteArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Project.
     * @param {ProjectUpdateArgs} args - Arguments to update one Project.
     * @example
     * // Update one Project
     * const project = await prisma.project.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends ProjectUpdateArgs>(args: Prisma.SelectSubset<T, ProjectUpdateArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Projects.
     * @param {ProjectDeleteManyArgs} args - Arguments to filter Projects to delete.
     * @example
     * // Delete a few Projects
     * const { count } = await prisma.project.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends ProjectDeleteManyArgs>(args?: Prisma.SelectSubset<T, ProjectDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Projects.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Projects
     * const project = await prisma.project.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends ProjectUpdateManyArgs>(args: Prisma.SelectSubset<T, ProjectUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Projects and returns the data updated in the database.
     * @param {ProjectUpdateManyAndReturnArgs} args - Arguments to update many Projects.
     * @example
     * // Update many Projects
     * const project = await prisma.project.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Projects and only return the `id`
     * const projectWithIdOnly = await prisma.project.updateManyAndReturn({
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
    updateManyAndReturn<T extends ProjectUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, ProjectUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Project.
     * @param {ProjectUpsertArgs} args - Arguments to update or create a Project.
     * @example
     * // Update or create a Project
     * const project = await prisma.project.upsert({
     *   create: {
     *     // ... data to create a Project
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Project we want to update
     *   }
     * })
     */
    upsert<T extends ProjectUpsertArgs>(args: Prisma.SelectSubset<T, ProjectUpsertArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Projects.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectCountArgs} args - Arguments to filter Projects to count.
     * @example
     * // Count the number of Projects
     * const count = await prisma.project.count({
     *   where: {
     *     // ... the filter for the Projects we want to count
     *   }
     * })
    **/
    count<T extends ProjectCountArgs>(args?: Prisma.Subset<T, ProjectCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], ProjectCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Project.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends ProjectAggregateArgs>(args: Prisma.Subset<T, ProjectAggregateArgs>): Prisma.PrismaPromise<GetProjectAggregateType<T>>;
    /**
     * Group by Project.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectGroupByArgs} args - Group by arguments.
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
    groupBy<T extends ProjectGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: ProjectGroupByArgs['orderBy'];
    } : {
        orderBy?: ProjectGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, ProjectGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetProjectGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Project model
     */
    readonly fields: ProjectFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Project.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__ProjectClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    members<T extends Prisma.Project$membersArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Project$membersArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ProjectMemberPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    workflows<T extends Prisma.Project$workflowsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Project$workflowsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    credentials<T extends Prisma.Project$credentialsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Project$credentialsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    dataTables<T extends Prisma.Project$dataTablesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Project$dataTablesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    shares<T extends Prisma.Project$sharesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Project$sharesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SharePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    variables<T extends Prisma.Project$variablesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Project$variablesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    environments<T extends Prisma.Project$environmentsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Project$environmentsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
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
 * Fields of the Project model
 */
export interface ProjectFieldRefs {
    readonly id: Prisma.FieldRef<"Project", 'String'>;
    readonly name: Prisma.FieldRef<"Project", 'String'>;
    readonly type: Prisma.FieldRef<"Project", 'String'>;
    readonly createdAt: Prisma.FieldRef<"Project", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"Project", 'DateTime'>;
}
/**
 * Project findUnique
 */
export type ProjectFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
    /**
     * Filter, which Project to fetch.
     */
    where: Prisma.ProjectWhereUniqueInput;
};
/**
 * Project findUniqueOrThrow
 */
export type ProjectFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
    /**
     * Filter, which Project to fetch.
     */
    where: Prisma.ProjectWhereUniqueInput;
};
/**
 * Project findFirst
 */
export type ProjectFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
    /**
     * Filter, which Project to fetch.
     */
    where?: Prisma.ProjectWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Projects to fetch.
     */
    orderBy?: Prisma.ProjectOrderByWithRelationInput | Prisma.ProjectOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Projects.
     */
    cursor?: Prisma.ProjectWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Projects from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Projects.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Projects.
     */
    distinct?: Prisma.ProjectScalarFieldEnum | Prisma.ProjectScalarFieldEnum[];
};
/**
 * Project findFirstOrThrow
 */
export type ProjectFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
    /**
     * Filter, which Project to fetch.
     */
    where?: Prisma.ProjectWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Projects to fetch.
     */
    orderBy?: Prisma.ProjectOrderByWithRelationInput | Prisma.ProjectOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Projects.
     */
    cursor?: Prisma.ProjectWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Projects from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Projects.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Projects.
     */
    distinct?: Prisma.ProjectScalarFieldEnum | Prisma.ProjectScalarFieldEnum[];
};
/**
 * Project findMany
 */
export type ProjectFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
    /**
     * Filter, which Projects to fetch.
     */
    where?: Prisma.ProjectWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Projects to fetch.
     */
    orderBy?: Prisma.ProjectOrderByWithRelationInput | Prisma.ProjectOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Projects.
     */
    cursor?: Prisma.ProjectWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Projects from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Projects.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Projects.
     */
    distinct?: Prisma.ProjectScalarFieldEnum | Prisma.ProjectScalarFieldEnum[];
};
/**
 * Project create
 */
export type ProjectCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
    /**
     * The data needed to create a Project.
     */
    data: Prisma.XOR<Prisma.ProjectCreateInput, Prisma.ProjectUncheckedCreateInput>;
};
/**
 * Project createMany
 */
export type ProjectCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Projects.
     */
    data: Prisma.ProjectCreateManyInput | Prisma.ProjectCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Project createManyAndReturn
 */
export type ProjectCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * The data used to create many Projects.
     */
    data: Prisma.ProjectCreateManyInput | Prisma.ProjectCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Project update
 */
export type ProjectUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
    /**
     * The data needed to update a Project.
     */
    data: Prisma.XOR<Prisma.ProjectUpdateInput, Prisma.ProjectUncheckedUpdateInput>;
    /**
     * Choose, which Project to update.
     */
    where: Prisma.ProjectWhereUniqueInput;
};
/**
 * Project updateMany
 */
export type ProjectUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Projects.
     */
    data: Prisma.XOR<Prisma.ProjectUpdateManyMutationInput, Prisma.ProjectUncheckedUpdateManyInput>;
    /**
     * Filter which Projects to update
     */
    where?: Prisma.ProjectWhereInput;
    /**
     * Limit how many Projects to update.
     */
    limit?: number;
};
/**
 * Project updateManyAndReturn
 */
export type ProjectUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * The data used to update Projects.
     */
    data: Prisma.XOR<Prisma.ProjectUpdateManyMutationInput, Prisma.ProjectUncheckedUpdateManyInput>;
    /**
     * Filter which Projects to update
     */
    where?: Prisma.ProjectWhereInput;
    /**
     * Limit how many Projects to update.
     */
    limit?: number;
};
/**
 * Project upsert
 */
export type ProjectUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
    /**
     * The filter to search for the Project to update in case it exists.
     */
    where: Prisma.ProjectWhereUniqueInput;
    /**
     * In case the Project found by the `where` argument doesn't exist, create a new Project with this data.
     */
    create: Prisma.XOR<Prisma.ProjectCreateInput, Prisma.ProjectUncheckedCreateInput>;
    /**
     * In case the Project was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.ProjectUpdateInput, Prisma.ProjectUncheckedUpdateInput>;
};
/**
 * Project delete
 */
export type ProjectDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
    /**
     * Filter which Project to delete.
     */
    where: Prisma.ProjectWhereUniqueInput;
};
/**
 * Project deleteMany
 */
export type ProjectDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Projects to delete
     */
    where?: Prisma.ProjectWhereInput;
    /**
     * Limit how many Projects to delete.
     */
    limit?: number;
};
/**
 * Project.members
 */
export type Project$membersArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProjectMember
     */
    select?: Prisma.ProjectMemberSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProjectMember
     */
    omit?: Prisma.ProjectMemberOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectMemberInclude<ExtArgs> | null;
    where?: Prisma.ProjectMemberWhereInput;
    orderBy?: Prisma.ProjectMemberOrderByWithRelationInput | Prisma.ProjectMemberOrderByWithRelationInput[];
    cursor?: Prisma.ProjectMemberWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ProjectMemberScalarFieldEnum | Prisma.ProjectMemberScalarFieldEnum[];
};
/**
 * Project.workflows
 */
export type Project$workflowsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    where?: Prisma.WorkflowWhereInput;
    orderBy?: Prisma.WorkflowOrderByWithRelationInput | Prisma.WorkflowOrderByWithRelationInput[];
    cursor?: Prisma.WorkflowWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.WorkflowScalarFieldEnum | Prisma.WorkflowScalarFieldEnum[];
};
/**
 * Project.credentials
 */
export type Project$credentialsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Credential
     */
    select?: Prisma.CredentialSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Credential
     */
    omit?: Prisma.CredentialOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CredentialInclude<ExtArgs> | null;
    where?: Prisma.CredentialWhereInput;
    orderBy?: Prisma.CredentialOrderByWithRelationInput | Prisma.CredentialOrderByWithRelationInput[];
    cursor?: Prisma.CredentialWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.CredentialScalarFieldEnum | Prisma.CredentialScalarFieldEnum[];
};
/**
 * Project.dataTables
 */
export type Project$dataTablesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    where?: Prisma.DataTableWhereInput;
    orderBy?: Prisma.DataTableOrderByWithRelationInput | Prisma.DataTableOrderByWithRelationInput[];
    cursor?: Prisma.DataTableWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.DataTableScalarFieldEnum | Prisma.DataTableScalarFieldEnum[];
};
/**
 * Project.shares
 */
export type Project$sharesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Share
     */
    select?: Prisma.ShareSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Share
     */
    omit?: Prisma.ShareOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ShareInclude<ExtArgs> | null;
    where?: Prisma.ShareWhereInput;
    orderBy?: Prisma.ShareOrderByWithRelationInput | Prisma.ShareOrderByWithRelationInput[];
    cursor?: Prisma.ShareWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ShareScalarFieldEnum | Prisma.ShareScalarFieldEnum[];
};
/**
 * Project.variables
 */
export type Project$variablesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Variable
     */
    select?: Prisma.VariableSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Variable
     */
    omit?: Prisma.VariableOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.VariableInclude<ExtArgs> | null;
    where?: Prisma.VariableWhereInput;
    orderBy?: Prisma.VariableOrderByWithRelationInput | Prisma.VariableOrderByWithRelationInput[];
    cursor?: Prisma.VariableWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.VariableScalarFieldEnum | Prisma.VariableScalarFieldEnum[];
};
/**
 * Project.environments
 */
export type Project$environmentsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Environment
     */
    select?: Prisma.EnvironmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Environment
     */
    omit?: Prisma.EnvironmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnvironmentInclude<ExtArgs> | null;
    where?: Prisma.EnvironmentWhereInput;
    orderBy?: Prisma.EnvironmentOrderByWithRelationInput | Prisma.EnvironmentOrderByWithRelationInput[];
    cursor?: Prisma.EnvironmentWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.EnvironmentScalarFieldEnum | Prisma.EnvironmentScalarFieldEnum[];
};
/**
 * Project without action
 */
export type ProjectDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Project
     */
    select?: Prisma.ProjectSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Project
     */
    omit?: Prisma.ProjectOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProjectInclude<ExtArgs> | null;
};
