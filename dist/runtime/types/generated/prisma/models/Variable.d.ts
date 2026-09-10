import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model Variable
 *
 */
export type VariableModel = runtime.Types.Result.DefaultSelection<Prisma.$VariablePayload>;
export type AggregateVariable = {
    _count: VariableCountAggregateOutputType | null;
    _min: VariableMinAggregateOutputType | null;
    _max: VariableMaxAggregateOutputType | null;
};
export type VariableMinAggregateOutputType = {
    id: string | null;
    key: string | null;
    value: string | null;
    scope: string | null;
    projectId: string | null;
    environmentId: string | null;
    secret: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type VariableMaxAggregateOutputType = {
    id: string | null;
    key: string | null;
    value: string | null;
    scope: string | null;
    projectId: string | null;
    environmentId: string | null;
    secret: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type VariableCountAggregateOutputType = {
    id: number;
    key: number;
    value: number;
    scope: number;
    projectId: number;
    environmentId: number;
    secret: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type VariableMinAggregateInputType = {
    id?: true;
    key?: true;
    value?: true;
    scope?: true;
    projectId?: true;
    environmentId?: true;
    secret?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type VariableMaxAggregateInputType = {
    id?: true;
    key?: true;
    value?: true;
    scope?: true;
    projectId?: true;
    environmentId?: true;
    secret?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type VariableCountAggregateInputType = {
    id?: true;
    key?: true;
    value?: true;
    scope?: true;
    projectId?: true;
    environmentId?: true;
    secret?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type VariableAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Variable to aggregate.
     */
    where?: Prisma.VariableWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Variables to fetch.
     */
    orderBy?: Prisma.VariableOrderByWithRelationInput | Prisma.VariableOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.VariableWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Variables from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Variables.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Variables
    **/
    _count?: true | VariableCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: VariableMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: VariableMaxAggregateInputType;
};
export type GetVariableAggregateType<T extends VariableAggregateArgs> = {
    [P in keyof T & keyof AggregateVariable]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateVariable[P]> : Prisma.GetScalarType<T[P], AggregateVariable[P]>;
};
export type VariableGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.VariableWhereInput;
    orderBy?: Prisma.VariableOrderByWithAggregationInput | Prisma.VariableOrderByWithAggregationInput[];
    by: Prisma.VariableScalarFieldEnum[] | Prisma.VariableScalarFieldEnum;
    having?: Prisma.VariableScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: VariableCountAggregateInputType | true;
    _min?: VariableMinAggregateInputType;
    _max?: VariableMaxAggregateInputType;
};
export type VariableGroupByOutputType = {
    id: string;
    key: string;
    value: string;
    scope: string;
    projectId: string | null;
    environmentId: string | null;
    secret: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: VariableCountAggregateOutputType | null;
    _min: VariableMinAggregateOutputType | null;
    _max: VariableMaxAggregateOutputType | null;
};
export type GetVariableGroupByPayload<T extends VariableGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<VariableGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof VariableGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], VariableGroupByOutputType[P]> : Prisma.GetScalarType<T[P], VariableGroupByOutputType[P]>;
}>>;
export type VariableWhereInput = {
    AND?: Prisma.VariableWhereInput | Prisma.VariableWhereInput[];
    OR?: Prisma.VariableWhereInput[];
    NOT?: Prisma.VariableWhereInput | Prisma.VariableWhereInput[];
    id?: Prisma.StringFilter<"Variable"> | string;
    key?: Prisma.StringFilter<"Variable"> | string;
    value?: Prisma.StringFilter<"Variable"> | string;
    scope?: Prisma.StringFilter<"Variable"> | string;
    projectId?: Prisma.StringNullableFilter<"Variable"> | string | null;
    environmentId?: Prisma.StringNullableFilter<"Variable"> | string | null;
    secret?: Prisma.BoolFilter<"Variable"> | boolean;
    createdAt?: Prisma.DateTimeFilter<"Variable"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Variable"> | Date | string;
    project?: Prisma.XOR<Prisma.ProjectNullableScalarRelationFilter, Prisma.ProjectWhereInput> | null;
    environment?: Prisma.XOR<Prisma.EnvironmentNullableScalarRelationFilter, Prisma.EnvironmentWhereInput> | null;
};
export type VariableOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    key?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    scope?: Prisma.SortOrder;
    projectId?: Prisma.SortOrderInput | Prisma.SortOrder;
    environmentId?: Prisma.SortOrderInput | Prisma.SortOrder;
    secret?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    project?: Prisma.ProjectOrderByWithRelationInput;
    environment?: Prisma.EnvironmentOrderByWithRelationInput;
};
export type VariableWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.VariableWhereInput | Prisma.VariableWhereInput[];
    OR?: Prisma.VariableWhereInput[];
    NOT?: Prisma.VariableWhereInput | Prisma.VariableWhereInput[];
    key?: Prisma.StringFilter<"Variable"> | string;
    value?: Prisma.StringFilter<"Variable"> | string;
    scope?: Prisma.StringFilter<"Variable"> | string;
    projectId?: Prisma.StringNullableFilter<"Variable"> | string | null;
    environmentId?: Prisma.StringNullableFilter<"Variable"> | string | null;
    secret?: Prisma.BoolFilter<"Variable"> | boolean;
    createdAt?: Prisma.DateTimeFilter<"Variable"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Variable"> | Date | string;
    project?: Prisma.XOR<Prisma.ProjectNullableScalarRelationFilter, Prisma.ProjectWhereInput> | null;
    environment?: Prisma.XOR<Prisma.EnvironmentNullableScalarRelationFilter, Prisma.EnvironmentWhereInput> | null;
}, "id">;
export type VariableOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    key?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    scope?: Prisma.SortOrder;
    projectId?: Prisma.SortOrderInput | Prisma.SortOrder;
    environmentId?: Prisma.SortOrderInput | Prisma.SortOrder;
    secret?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.VariableCountOrderByAggregateInput;
    _max?: Prisma.VariableMaxOrderByAggregateInput;
    _min?: Prisma.VariableMinOrderByAggregateInput;
};
export type VariableScalarWhereWithAggregatesInput = {
    AND?: Prisma.VariableScalarWhereWithAggregatesInput | Prisma.VariableScalarWhereWithAggregatesInput[];
    OR?: Prisma.VariableScalarWhereWithAggregatesInput[];
    NOT?: Prisma.VariableScalarWhereWithAggregatesInput | Prisma.VariableScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Variable"> | string;
    key?: Prisma.StringWithAggregatesFilter<"Variable"> | string;
    value?: Prisma.StringWithAggregatesFilter<"Variable"> | string;
    scope?: Prisma.StringWithAggregatesFilter<"Variable"> | string;
    projectId?: Prisma.StringNullableWithAggregatesFilter<"Variable"> | string | null;
    environmentId?: Prisma.StringNullableWithAggregatesFilter<"Variable"> | string | null;
    secret?: Prisma.BoolWithAggregatesFilter<"Variable"> | boolean;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"Variable"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"Variable"> | Date | string;
};
export type VariableCreateInput = {
    id?: string;
    key: string;
    value?: string;
    scope?: string;
    secret?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    project?: Prisma.ProjectCreateNestedOneWithoutVariablesInput;
    environment?: Prisma.EnvironmentCreateNestedOneWithoutVariablesInput;
};
export type VariableUncheckedCreateInput = {
    id?: string;
    key: string;
    value?: string;
    scope?: string;
    projectId?: string | null;
    environmentId?: string | null;
    secret?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type VariableUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    project?: Prisma.ProjectUpdateOneWithoutVariablesNestedInput;
    environment?: Prisma.EnvironmentUpdateOneWithoutVariablesNestedInput;
};
export type VariableUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    environmentId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type VariableCreateManyInput = {
    id?: string;
    key: string;
    value?: string;
    scope?: string;
    projectId?: string | null;
    environmentId?: string | null;
    secret?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type VariableUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type VariableUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    environmentId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type VariableListRelationFilter = {
    every?: Prisma.VariableWhereInput;
    some?: Prisma.VariableWhereInput;
    none?: Prisma.VariableWhereInput;
};
export type VariableOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type VariableCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    key?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    scope?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    environmentId?: Prisma.SortOrder;
    secret?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type VariableMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    key?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    scope?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    environmentId?: Prisma.SortOrder;
    secret?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type VariableMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    key?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    scope?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    environmentId?: Prisma.SortOrder;
    secret?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type VariableCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.VariableCreateWithoutProjectInput, Prisma.VariableUncheckedCreateWithoutProjectInput> | Prisma.VariableCreateWithoutProjectInput[] | Prisma.VariableUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.VariableCreateOrConnectWithoutProjectInput | Prisma.VariableCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.VariableCreateManyProjectInputEnvelope;
    connect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
};
export type VariableUncheckedCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.VariableCreateWithoutProjectInput, Prisma.VariableUncheckedCreateWithoutProjectInput> | Prisma.VariableCreateWithoutProjectInput[] | Prisma.VariableUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.VariableCreateOrConnectWithoutProjectInput | Prisma.VariableCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.VariableCreateManyProjectInputEnvelope;
    connect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
};
export type VariableUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.VariableCreateWithoutProjectInput, Prisma.VariableUncheckedCreateWithoutProjectInput> | Prisma.VariableCreateWithoutProjectInput[] | Prisma.VariableUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.VariableCreateOrConnectWithoutProjectInput | Prisma.VariableCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.VariableUpsertWithWhereUniqueWithoutProjectInput | Prisma.VariableUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.VariableCreateManyProjectInputEnvelope;
    set?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    disconnect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    delete?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    connect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    update?: Prisma.VariableUpdateWithWhereUniqueWithoutProjectInput | Prisma.VariableUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.VariableUpdateManyWithWhereWithoutProjectInput | Prisma.VariableUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.VariableScalarWhereInput | Prisma.VariableScalarWhereInput[];
};
export type VariableUncheckedUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.VariableCreateWithoutProjectInput, Prisma.VariableUncheckedCreateWithoutProjectInput> | Prisma.VariableCreateWithoutProjectInput[] | Prisma.VariableUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.VariableCreateOrConnectWithoutProjectInput | Prisma.VariableCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.VariableUpsertWithWhereUniqueWithoutProjectInput | Prisma.VariableUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.VariableCreateManyProjectInputEnvelope;
    set?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    disconnect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    delete?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    connect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    update?: Prisma.VariableUpdateWithWhereUniqueWithoutProjectInput | Prisma.VariableUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.VariableUpdateManyWithWhereWithoutProjectInput | Prisma.VariableUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.VariableScalarWhereInput | Prisma.VariableScalarWhereInput[];
};
export type VariableCreateNestedManyWithoutEnvironmentInput = {
    create?: Prisma.XOR<Prisma.VariableCreateWithoutEnvironmentInput, Prisma.VariableUncheckedCreateWithoutEnvironmentInput> | Prisma.VariableCreateWithoutEnvironmentInput[] | Prisma.VariableUncheckedCreateWithoutEnvironmentInput[];
    connectOrCreate?: Prisma.VariableCreateOrConnectWithoutEnvironmentInput | Prisma.VariableCreateOrConnectWithoutEnvironmentInput[];
    createMany?: Prisma.VariableCreateManyEnvironmentInputEnvelope;
    connect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
};
export type VariableUncheckedCreateNestedManyWithoutEnvironmentInput = {
    create?: Prisma.XOR<Prisma.VariableCreateWithoutEnvironmentInput, Prisma.VariableUncheckedCreateWithoutEnvironmentInput> | Prisma.VariableCreateWithoutEnvironmentInput[] | Prisma.VariableUncheckedCreateWithoutEnvironmentInput[];
    connectOrCreate?: Prisma.VariableCreateOrConnectWithoutEnvironmentInput | Prisma.VariableCreateOrConnectWithoutEnvironmentInput[];
    createMany?: Prisma.VariableCreateManyEnvironmentInputEnvelope;
    connect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
};
export type VariableUpdateManyWithoutEnvironmentNestedInput = {
    create?: Prisma.XOR<Prisma.VariableCreateWithoutEnvironmentInput, Prisma.VariableUncheckedCreateWithoutEnvironmentInput> | Prisma.VariableCreateWithoutEnvironmentInput[] | Prisma.VariableUncheckedCreateWithoutEnvironmentInput[];
    connectOrCreate?: Prisma.VariableCreateOrConnectWithoutEnvironmentInput | Prisma.VariableCreateOrConnectWithoutEnvironmentInput[];
    upsert?: Prisma.VariableUpsertWithWhereUniqueWithoutEnvironmentInput | Prisma.VariableUpsertWithWhereUniqueWithoutEnvironmentInput[];
    createMany?: Prisma.VariableCreateManyEnvironmentInputEnvelope;
    set?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    disconnect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    delete?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    connect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    update?: Prisma.VariableUpdateWithWhereUniqueWithoutEnvironmentInput | Prisma.VariableUpdateWithWhereUniqueWithoutEnvironmentInput[];
    updateMany?: Prisma.VariableUpdateManyWithWhereWithoutEnvironmentInput | Prisma.VariableUpdateManyWithWhereWithoutEnvironmentInput[];
    deleteMany?: Prisma.VariableScalarWhereInput | Prisma.VariableScalarWhereInput[];
};
export type VariableUncheckedUpdateManyWithoutEnvironmentNestedInput = {
    create?: Prisma.XOR<Prisma.VariableCreateWithoutEnvironmentInput, Prisma.VariableUncheckedCreateWithoutEnvironmentInput> | Prisma.VariableCreateWithoutEnvironmentInput[] | Prisma.VariableUncheckedCreateWithoutEnvironmentInput[];
    connectOrCreate?: Prisma.VariableCreateOrConnectWithoutEnvironmentInput | Prisma.VariableCreateOrConnectWithoutEnvironmentInput[];
    upsert?: Prisma.VariableUpsertWithWhereUniqueWithoutEnvironmentInput | Prisma.VariableUpsertWithWhereUniqueWithoutEnvironmentInput[];
    createMany?: Prisma.VariableCreateManyEnvironmentInputEnvelope;
    set?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    disconnect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    delete?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    connect?: Prisma.VariableWhereUniqueInput | Prisma.VariableWhereUniqueInput[];
    update?: Prisma.VariableUpdateWithWhereUniqueWithoutEnvironmentInput | Prisma.VariableUpdateWithWhereUniqueWithoutEnvironmentInput[];
    updateMany?: Prisma.VariableUpdateManyWithWhereWithoutEnvironmentInput | Prisma.VariableUpdateManyWithWhereWithoutEnvironmentInput[];
    deleteMany?: Prisma.VariableScalarWhereInput | Prisma.VariableScalarWhereInput[];
};
export type VariableCreateWithoutProjectInput = {
    id?: string;
    key: string;
    value?: string;
    scope?: string;
    secret?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    environment?: Prisma.EnvironmentCreateNestedOneWithoutVariablesInput;
};
export type VariableUncheckedCreateWithoutProjectInput = {
    id?: string;
    key: string;
    value?: string;
    scope?: string;
    environmentId?: string | null;
    secret?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type VariableCreateOrConnectWithoutProjectInput = {
    where: Prisma.VariableWhereUniqueInput;
    create: Prisma.XOR<Prisma.VariableCreateWithoutProjectInput, Prisma.VariableUncheckedCreateWithoutProjectInput>;
};
export type VariableCreateManyProjectInputEnvelope = {
    data: Prisma.VariableCreateManyProjectInput | Prisma.VariableCreateManyProjectInput[];
    skipDuplicates?: boolean;
};
export type VariableUpsertWithWhereUniqueWithoutProjectInput = {
    where: Prisma.VariableWhereUniqueInput;
    update: Prisma.XOR<Prisma.VariableUpdateWithoutProjectInput, Prisma.VariableUncheckedUpdateWithoutProjectInput>;
    create: Prisma.XOR<Prisma.VariableCreateWithoutProjectInput, Prisma.VariableUncheckedCreateWithoutProjectInput>;
};
export type VariableUpdateWithWhereUniqueWithoutProjectInput = {
    where: Prisma.VariableWhereUniqueInput;
    data: Prisma.XOR<Prisma.VariableUpdateWithoutProjectInput, Prisma.VariableUncheckedUpdateWithoutProjectInput>;
};
export type VariableUpdateManyWithWhereWithoutProjectInput = {
    where: Prisma.VariableScalarWhereInput;
    data: Prisma.XOR<Prisma.VariableUpdateManyMutationInput, Prisma.VariableUncheckedUpdateManyWithoutProjectInput>;
};
export type VariableScalarWhereInput = {
    AND?: Prisma.VariableScalarWhereInput | Prisma.VariableScalarWhereInput[];
    OR?: Prisma.VariableScalarWhereInput[];
    NOT?: Prisma.VariableScalarWhereInput | Prisma.VariableScalarWhereInput[];
    id?: Prisma.StringFilter<"Variable"> | string;
    key?: Prisma.StringFilter<"Variable"> | string;
    value?: Prisma.StringFilter<"Variable"> | string;
    scope?: Prisma.StringFilter<"Variable"> | string;
    projectId?: Prisma.StringNullableFilter<"Variable"> | string | null;
    environmentId?: Prisma.StringNullableFilter<"Variable"> | string | null;
    secret?: Prisma.BoolFilter<"Variable"> | boolean;
    createdAt?: Prisma.DateTimeFilter<"Variable"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Variable"> | Date | string;
};
export type VariableCreateWithoutEnvironmentInput = {
    id?: string;
    key: string;
    value?: string;
    scope?: string;
    secret?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    project?: Prisma.ProjectCreateNestedOneWithoutVariablesInput;
};
export type VariableUncheckedCreateWithoutEnvironmentInput = {
    id?: string;
    key: string;
    value?: string;
    scope?: string;
    projectId?: string | null;
    secret?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type VariableCreateOrConnectWithoutEnvironmentInput = {
    where: Prisma.VariableWhereUniqueInput;
    create: Prisma.XOR<Prisma.VariableCreateWithoutEnvironmentInput, Prisma.VariableUncheckedCreateWithoutEnvironmentInput>;
};
export type VariableCreateManyEnvironmentInputEnvelope = {
    data: Prisma.VariableCreateManyEnvironmentInput | Prisma.VariableCreateManyEnvironmentInput[];
    skipDuplicates?: boolean;
};
export type VariableUpsertWithWhereUniqueWithoutEnvironmentInput = {
    where: Prisma.VariableWhereUniqueInput;
    update: Prisma.XOR<Prisma.VariableUpdateWithoutEnvironmentInput, Prisma.VariableUncheckedUpdateWithoutEnvironmentInput>;
    create: Prisma.XOR<Prisma.VariableCreateWithoutEnvironmentInput, Prisma.VariableUncheckedCreateWithoutEnvironmentInput>;
};
export type VariableUpdateWithWhereUniqueWithoutEnvironmentInput = {
    where: Prisma.VariableWhereUniqueInput;
    data: Prisma.XOR<Prisma.VariableUpdateWithoutEnvironmentInput, Prisma.VariableUncheckedUpdateWithoutEnvironmentInput>;
};
export type VariableUpdateManyWithWhereWithoutEnvironmentInput = {
    where: Prisma.VariableScalarWhereInput;
    data: Prisma.XOR<Prisma.VariableUpdateManyMutationInput, Prisma.VariableUncheckedUpdateManyWithoutEnvironmentInput>;
};
export type VariableCreateManyProjectInput = {
    id?: string;
    key: string;
    value?: string;
    scope?: string;
    environmentId?: string | null;
    secret?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type VariableUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    environment?: Prisma.EnvironmentUpdateOneWithoutVariablesNestedInput;
};
export type VariableUncheckedUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    environmentId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type VariableUncheckedUpdateManyWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    environmentId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type VariableCreateManyEnvironmentInput = {
    id?: string;
    key: string;
    value?: string;
    scope?: string;
    projectId?: string | null;
    secret?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type VariableUpdateWithoutEnvironmentInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    project?: Prisma.ProjectUpdateOneWithoutVariablesNestedInput;
};
export type VariableUncheckedUpdateWithoutEnvironmentInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type VariableUncheckedUpdateManyWithoutEnvironmentInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    key?: Prisma.StringFieldUpdateOperationsInput | string;
    value?: Prisma.StringFieldUpdateOperationsInput | string;
    scope?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    secret?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type VariableSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    key?: boolean;
    value?: boolean;
    scope?: boolean;
    projectId?: boolean;
    environmentId?: boolean;
    secret?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    project?: boolean | Prisma.Variable$projectArgs<ExtArgs>;
    environment?: boolean | Prisma.Variable$environmentArgs<ExtArgs>;
}, ExtArgs["result"]["variable"]>;
export type VariableSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    key?: boolean;
    value?: boolean;
    scope?: boolean;
    projectId?: boolean;
    environmentId?: boolean;
    secret?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    project?: boolean | Prisma.Variable$projectArgs<ExtArgs>;
    environment?: boolean | Prisma.Variable$environmentArgs<ExtArgs>;
}, ExtArgs["result"]["variable"]>;
export type VariableSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    key?: boolean;
    value?: boolean;
    scope?: boolean;
    projectId?: boolean;
    environmentId?: boolean;
    secret?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    project?: boolean | Prisma.Variable$projectArgs<ExtArgs>;
    environment?: boolean | Prisma.Variable$environmentArgs<ExtArgs>;
}, ExtArgs["result"]["variable"]>;
export type VariableSelectScalar = {
    id?: boolean;
    key?: boolean;
    value?: boolean;
    scope?: boolean;
    projectId?: boolean;
    environmentId?: boolean;
    secret?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type VariableOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "key" | "value" | "scope" | "projectId" | "environmentId" | "secret" | "createdAt" | "updatedAt", ExtArgs["result"]["variable"]>;
export type VariableInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    project?: boolean | Prisma.Variable$projectArgs<ExtArgs>;
    environment?: boolean | Prisma.Variable$environmentArgs<ExtArgs>;
};
export type VariableIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    project?: boolean | Prisma.Variable$projectArgs<ExtArgs>;
    environment?: boolean | Prisma.Variable$environmentArgs<ExtArgs>;
};
export type VariableIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    project?: boolean | Prisma.Variable$projectArgs<ExtArgs>;
    environment?: boolean | Prisma.Variable$environmentArgs<ExtArgs>;
};
export type $VariablePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Variable";
    objects: {
        project: Prisma.$ProjectPayload<ExtArgs> | null;
        environment: Prisma.$EnvironmentPayload<ExtArgs> | null;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        /**
         * Unique within scope + environment (instance or project)
         */
        key: string;
        /**
         * Stored as JSON string of the value (string/number/bool/object)
         */
        value: string;
        /**
         * instance | project
         */
        scope: string;
        projectId: string | null;
        /**
         * null = base value for all envs; set = override for that environment
         */
        environmentId: string | null;
        /**
         * When true, value is AES-encrypted and redacted in list APIs
         */
        secret: boolean;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["variable"]>;
    composites: {};
};
export type VariableGetPayload<S extends boolean | null | undefined | VariableDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$VariablePayload, S>;
export type VariableCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<VariableFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: VariableCountAggregateInputType | true;
};
export interface VariableDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Variable'];
        meta: {
            name: 'Variable';
        };
    };
    /**
     * Find zero or one Variable that matches the filter.
     * @param {VariableFindUniqueArgs} args - Arguments to find a Variable
     * @example
     * // Get one Variable
     * const variable = await prisma.variable.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends VariableFindUniqueArgs>(args: Prisma.SelectSubset<T, VariableFindUniqueArgs<ExtArgs>>): Prisma.Prisma__VariableClient<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Variable that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {VariableFindUniqueOrThrowArgs} args - Arguments to find a Variable
     * @example
     * // Get one Variable
     * const variable = await prisma.variable.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends VariableFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, VariableFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__VariableClient<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Variable that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VariableFindFirstArgs} args - Arguments to find a Variable
     * @example
     * // Get one Variable
     * const variable = await prisma.variable.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends VariableFindFirstArgs>(args?: Prisma.SelectSubset<T, VariableFindFirstArgs<ExtArgs>>): Prisma.Prisma__VariableClient<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Variable that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VariableFindFirstOrThrowArgs} args - Arguments to find a Variable
     * @example
     * // Get one Variable
     * const variable = await prisma.variable.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends VariableFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, VariableFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__VariableClient<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Variables that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VariableFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Variables
     * const variables = await prisma.variable.findMany()
     *
     * // Get first 10 Variables
     * const variables = await prisma.variable.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const variableWithIdOnly = await prisma.variable.findMany({ select: { id: true } })
     *
     */
    findMany<T extends VariableFindManyArgs>(args?: Prisma.SelectSubset<T, VariableFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Variable.
     * @param {VariableCreateArgs} args - Arguments to create a Variable.
     * @example
     * // Create one Variable
     * const Variable = await prisma.variable.create({
     *   data: {
     *     // ... data to create a Variable
     *   }
     * })
     *
     */
    create<T extends VariableCreateArgs>(args: Prisma.SelectSubset<T, VariableCreateArgs<ExtArgs>>): Prisma.Prisma__VariableClient<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Variables.
     * @param {VariableCreateManyArgs} args - Arguments to create many Variables.
     * @example
     * // Create many Variables
     * const variable = await prisma.variable.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends VariableCreateManyArgs>(args?: Prisma.SelectSubset<T, VariableCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Variables and returns the data saved in the database.
     * @param {VariableCreateManyAndReturnArgs} args - Arguments to create many Variables.
     * @example
     * // Create many Variables
     * const variable = await prisma.variable.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Variables and only return the `id`
     * const variableWithIdOnly = await prisma.variable.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends VariableCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, VariableCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Variable.
     * @param {VariableDeleteArgs} args - Arguments to delete one Variable.
     * @example
     * // Delete one Variable
     * const Variable = await prisma.variable.delete({
     *   where: {
     *     // ... filter to delete one Variable
     *   }
     * })
     *
     */
    delete<T extends VariableDeleteArgs>(args: Prisma.SelectSubset<T, VariableDeleteArgs<ExtArgs>>): Prisma.Prisma__VariableClient<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Variable.
     * @param {VariableUpdateArgs} args - Arguments to update one Variable.
     * @example
     * // Update one Variable
     * const variable = await prisma.variable.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends VariableUpdateArgs>(args: Prisma.SelectSubset<T, VariableUpdateArgs<ExtArgs>>): Prisma.Prisma__VariableClient<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Variables.
     * @param {VariableDeleteManyArgs} args - Arguments to filter Variables to delete.
     * @example
     * // Delete a few Variables
     * const { count } = await prisma.variable.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends VariableDeleteManyArgs>(args?: Prisma.SelectSubset<T, VariableDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Variables.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VariableUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Variables
     * const variable = await prisma.variable.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends VariableUpdateManyArgs>(args: Prisma.SelectSubset<T, VariableUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Variables and returns the data updated in the database.
     * @param {VariableUpdateManyAndReturnArgs} args - Arguments to update many Variables.
     * @example
     * // Update many Variables
     * const variable = await prisma.variable.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Variables and only return the `id`
     * const variableWithIdOnly = await prisma.variable.updateManyAndReturn({
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
    updateManyAndReturn<T extends VariableUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, VariableUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Variable.
     * @param {VariableUpsertArgs} args - Arguments to update or create a Variable.
     * @example
     * // Update or create a Variable
     * const variable = await prisma.variable.upsert({
     *   create: {
     *     // ... data to create a Variable
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Variable we want to update
     *   }
     * })
     */
    upsert<T extends VariableUpsertArgs>(args: Prisma.SelectSubset<T, VariableUpsertArgs<ExtArgs>>): Prisma.Prisma__VariableClient<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Variables.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VariableCountArgs} args - Arguments to filter Variables to count.
     * @example
     * // Count the number of Variables
     * const count = await prisma.variable.count({
     *   where: {
     *     // ... the filter for the Variables we want to count
     *   }
     * })
    **/
    count<T extends VariableCountArgs>(args?: Prisma.Subset<T, VariableCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], VariableCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Variable.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VariableAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends VariableAggregateArgs>(args: Prisma.Subset<T, VariableAggregateArgs>): Prisma.PrismaPromise<GetVariableAggregateType<T>>;
    /**
     * Group by Variable.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VariableGroupByArgs} args - Group by arguments.
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
    groupBy<T extends VariableGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: VariableGroupByArgs['orderBy'];
    } : {
        orderBy?: VariableGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, VariableGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetVariableGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Variable model
     */
    readonly fields: VariableFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Variable.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__VariableClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    project<T extends Prisma.Variable$projectArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Variable$projectArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    environment<T extends Prisma.Variable$environmentArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Variable$environmentArgs<ExtArgs>>): Prisma.Prisma__EnvironmentClient<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
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
 * Fields of the Variable model
 */
export interface VariableFieldRefs {
    readonly id: Prisma.FieldRef<"Variable", 'String'>;
    readonly key: Prisma.FieldRef<"Variable", 'String'>;
    readonly value: Prisma.FieldRef<"Variable", 'String'>;
    readonly scope: Prisma.FieldRef<"Variable", 'String'>;
    readonly projectId: Prisma.FieldRef<"Variable", 'String'>;
    readonly environmentId: Prisma.FieldRef<"Variable", 'String'>;
    readonly secret: Prisma.FieldRef<"Variable", 'Boolean'>;
    readonly createdAt: Prisma.FieldRef<"Variable", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"Variable", 'DateTime'>;
}
/**
 * Variable findUnique
 */
export type VariableFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Variable to fetch.
     */
    where: Prisma.VariableWhereUniqueInput;
};
/**
 * Variable findUniqueOrThrow
 */
export type VariableFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Variable to fetch.
     */
    where: Prisma.VariableWhereUniqueInput;
};
/**
 * Variable findFirst
 */
export type VariableFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Variable to fetch.
     */
    where?: Prisma.VariableWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Variables to fetch.
     */
    orderBy?: Prisma.VariableOrderByWithRelationInput | Prisma.VariableOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Variables.
     */
    cursor?: Prisma.VariableWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Variables from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Variables.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Variables.
     */
    distinct?: Prisma.VariableScalarFieldEnum | Prisma.VariableScalarFieldEnum[];
};
/**
 * Variable findFirstOrThrow
 */
export type VariableFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Variable to fetch.
     */
    where?: Prisma.VariableWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Variables to fetch.
     */
    orderBy?: Prisma.VariableOrderByWithRelationInput | Prisma.VariableOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Variables.
     */
    cursor?: Prisma.VariableWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Variables from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Variables.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Variables.
     */
    distinct?: Prisma.VariableScalarFieldEnum | Prisma.VariableScalarFieldEnum[];
};
/**
 * Variable findMany
 */
export type VariableFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Variables to fetch.
     */
    where?: Prisma.VariableWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Variables to fetch.
     */
    orderBy?: Prisma.VariableOrderByWithRelationInput | Prisma.VariableOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Variables.
     */
    cursor?: Prisma.VariableWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Variables from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Variables.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Variables.
     */
    distinct?: Prisma.VariableScalarFieldEnum | Prisma.VariableScalarFieldEnum[];
};
/**
 * Variable create
 */
export type VariableCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a Variable.
     */
    data: Prisma.XOR<Prisma.VariableCreateInput, Prisma.VariableUncheckedCreateInput>;
};
/**
 * Variable createMany
 */
export type VariableCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Variables.
     */
    data: Prisma.VariableCreateManyInput | Prisma.VariableCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Variable createManyAndReturn
 */
export type VariableCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Variable
     */
    select?: Prisma.VariableSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Variable
     */
    omit?: Prisma.VariableOmit<ExtArgs> | null;
    /**
     * The data used to create many Variables.
     */
    data: Prisma.VariableCreateManyInput | Prisma.VariableCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.VariableIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * Variable update
 */
export type VariableUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a Variable.
     */
    data: Prisma.XOR<Prisma.VariableUpdateInput, Prisma.VariableUncheckedUpdateInput>;
    /**
     * Choose, which Variable to update.
     */
    where: Prisma.VariableWhereUniqueInput;
};
/**
 * Variable updateMany
 */
export type VariableUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Variables.
     */
    data: Prisma.XOR<Prisma.VariableUpdateManyMutationInput, Prisma.VariableUncheckedUpdateManyInput>;
    /**
     * Filter which Variables to update
     */
    where?: Prisma.VariableWhereInput;
    /**
     * Limit how many Variables to update.
     */
    limit?: number;
};
/**
 * Variable updateManyAndReturn
 */
export type VariableUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Variable
     */
    select?: Prisma.VariableSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Variable
     */
    omit?: Prisma.VariableOmit<ExtArgs> | null;
    /**
     * The data used to update Variables.
     */
    data: Prisma.XOR<Prisma.VariableUpdateManyMutationInput, Prisma.VariableUncheckedUpdateManyInput>;
    /**
     * Filter which Variables to update
     */
    where?: Prisma.VariableWhereInput;
    /**
     * Limit how many Variables to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.VariableIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * Variable upsert
 */
export type VariableUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the Variable to update in case it exists.
     */
    where: Prisma.VariableWhereUniqueInput;
    /**
     * In case the Variable found by the `where` argument doesn't exist, create a new Variable with this data.
     */
    create: Prisma.XOR<Prisma.VariableCreateInput, Prisma.VariableUncheckedCreateInput>;
    /**
     * In case the Variable was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.VariableUpdateInput, Prisma.VariableUncheckedUpdateInput>;
};
/**
 * Variable delete
 */
export type VariableDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which Variable to delete.
     */
    where: Prisma.VariableWhereUniqueInput;
};
/**
 * Variable deleteMany
 */
export type VariableDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Variables to delete
     */
    where?: Prisma.VariableWhereInput;
    /**
     * Limit how many Variables to delete.
     */
    limit?: number;
};
/**
 * Variable.project
 */
export type Variable$projectArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    where?: Prisma.ProjectWhereInput;
};
/**
 * Variable.environment
 */
export type Variable$environmentArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
/**
 * Variable without action
 */
export type VariableDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
