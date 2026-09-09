import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model Environment
 *
 */
export type EnvironmentModel = runtime.Types.Result.DefaultSelection<Prisma.$EnvironmentPayload>;
export type AggregateEnvironment = {
    _count: EnvironmentCountAggregateOutputType | null;
    _avg: EnvironmentAvgAggregateOutputType | null;
    _sum: EnvironmentSumAggregateOutputType | null;
    _min: EnvironmentMinAggregateOutputType | null;
    _max: EnvironmentMaxAggregateOutputType | null;
};
export type EnvironmentAvgAggregateOutputType = {
    sortOrder: number | null;
};
export type EnvironmentSumAggregateOutputType = {
    sortOrder: number | null;
};
export type EnvironmentMinAggregateOutputType = {
    id: string | null;
    projectId: string | null;
    name: string | null;
    slug: string | null;
    isDefault: boolean | null;
    sortOrder: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type EnvironmentMaxAggregateOutputType = {
    id: string | null;
    projectId: string | null;
    name: string | null;
    slug: string | null;
    isDefault: boolean | null;
    sortOrder: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type EnvironmentCountAggregateOutputType = {
    id: number;
    projectId: number;
    name: number;
    slug: number;
    isDefault: number;
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type EnvironmentAvgAggregateInputType = {
    sortOrder?: true;
};
export type EnvironmentSumAggregateInputType = {
    sortOrder?: true;
};
export type EnvironmentMinAggregateInputType = {
    id?: true;
    projectId?: true;
    name?: true;
    slug?: true;
    isDefault?: true;
    sortOrder?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type EnvironmentMaxAggregateInputType = {
    id?: true;
    projectId?: true;
    name?: true;
    slug?: true;
    isDefault?: true;
    sortOrder?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type EnvironmentCountAggregateInputType = {
    id?: true;
    projectId?: true;
    name?: true;
    slug?: true;
    isDefault?: true;
    sortOrder?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type EnvironmentAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Environment to aggregate.
     */
    where?: Prisma.EnvironmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Environments to fetch.
     */
    orderBy?: Prisma.EnvironmentOrderByWithRelationInput | Prisma.EnvironmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.EnvironmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Environments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Environments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Environments
    **/
    _count?: true | EnvironmentCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: EnvironmentAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: EnvironmentSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: EnvironmentMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: EnvironmentMaxAggregateInputType;
};
export type GetEnvironmentAggregateType<T extends EnvironmentAggregateArgs> = {
    [P in keyof T & keyof AggregateEnvironment]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateEnvironment[P]> : Prisma.GetScalarType<T[P], AggregateEnvironment[P]>;
};
export type EnvironmentGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.EnvironmentWhereInput;
    orderBy?: Prisma.EnvironmentOrderByWithAggregationInput | Prisma.EnvironmentOrderByWithAggregationInput[];
    by: Prisma.EnvironmentScalarFieldEnum[] | Prisma.EnvironmentScalarFieldEnum;
    having?: Prisma.EnvironmentScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: EnvironmentCountAggregateInputType | true;
    _avg?: EnvironmentAvgAggregateInputType;
    _sum?: EnvironmentSumAggregateInputType;
    _min?: EnvironmentMinAggregateInputType;
    _max?: EnvironmentMaxAggregateInputType;
};
export type EnvironmentGroupByOutputType = {
    id: string;
    projectId: string | null;
    name: string;
    slug: string;
    isDefault: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    _count: EnvironmentCountAggregateOutputType | null;
    _avg: EnvironmentAvgAggregateOutputType | null;
    _sum: EnvironmentSumAggregateOutputType | null;
    _min: EnvironmentMinAggregateOutputType | null;
    _max: EnvironmentMaxAggregateOutputType | null;
};
export type GetEnvironmentGroupByPayload<T extends EnvironmentGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<EnvironmentGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof EnvironmentGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], EnvironmentGroupByOutputType[P]> : Prisma.GetScalarType<T[P], EnvironmentGroupByOutputType[P]>;
}>>;
export type EnvironmentWhereInput = {
    AND?: Prisma.EnvironmentWhereInput | Prisma.EnvironmentWhereInput[];
    OR?: Prisma.EnvironmentWhereInput[];
    NOT?: Prisma.EnvironmentWhereInput | Prisma.EnvironmentWhereInput[];
    id?: Prisma.StringFilter<"Environment"> | string;
    projectId?: Prisma.StringNullableFilter<"Environment"> | string | null;
    name?: Prisma.StringFilter<"Environment"> | string;
    slug?: Prisma.StringFilter<"Environment"> | string;
    isDefault?: Prisma.BoolFilter<"Environment"> | boolean;
    sortOrder?: Prisma.IntFilter<"Environment"> | number;
    createdAt?: Prisma.DateTimeFilter<"Environment"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Environment"> | Date | string;
    project?: Prisma.XOR<Prisma.ProjectNullableScalarRelationFilter, Prisma.ProjectWhereInput> | null;
    variables?: Prisma.VariableListRelationFilter;
};
export type EnvironmentOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    projectId?: Prisma.SortOrderInput | Prisma.SortOrder;
    name?: Prisma.SortOrder;
    slug?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    sortOrder?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    project?: Prisma.ProjectOrderByWithRelationInput;
    variables?: Prisma.VariableOrderByRelationAggregateInput;
};
export type EnvironmentWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.EnvironmentWhereInput | Prisma.EnvironmentWhereInput[];
    OR?: Prisma.EnvironmentWhereInput[];
    NOT?: Prisma.EnvironmentWhereInput | Prisma.EnvironmentWhereInput[];
    projectId?: Prisma.StringNullableFilter<"Environment"> | string | null;
    name?: Prisma.StringFilter<"Environment"> | string;
    slug?: Prisma.StringFilter<"Environment"> | string;
    isDefault?: Prisma.BoolFilter<"Environment"> | boolean;
    sortOrder?: Prisma.IntFilter<"Environment"> | number;
    createdAt?: Prisma.DateTimeFilter<"Environment"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Environment"> | Date | string;
    project?: Prisma.XOR<Prisma.ProjectNullableScalarRelationFilter, Prisma.ProjectWhereInput> | null;
    variables?: Prisma.VariableListRelationFilter;
}, "id">;
export type EnvironmentOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    projectId?: Prisma.SortOrderInput | Prisma.SortOrder;
    name?: Prisma.SortOrder;
    slug?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    sortOrder?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.EnvironmentCountOrderByAggregateInput;
    _avg?: Prisma.EnvironmentAvgOrderByAggregateInput;
    _max?: Prisma.EnvironmentMaxOrderByAggregateInput;
    _min?: Prisma.EnvironmentMinOrderByAggregateInput;
    _sum?: Prisma.EnvironmentSumOrderByAggregateInput;
};
export type EnvironmentScalarWhereWithAggregatesInput = {
    AND?: Prisma.EnvironmentScalarWhereWithAggregatesInput | Prisma.EnvironmentScalarWhereWithAggregatesInput[];
    OR?: Prisma.EnvironmentScalarWhereWithAggregatesInput[];
    NOT?: Prisma.EnvironmentScalarWhereWithAggregatesInput | Prisma.EnvironmentScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Environment"> | string;
    projectId?: Prisma.StringNullableWithAggregatesFilter<"Environment"> | string | null;
    name?: Prisma.StringWithAggregatesFilter<"Environment"> | string;
    slug?: Prisma.StringWithAggregatesFilter<"Environment"> | string;
    isDefault?: Prisma.BoolWithAggregatesFilter<"Environment"> | boolean;
    sortOrder?: Prisma.IntWithAggregatesFilter<"Environment"> | number;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"Environment"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"Environment"> | Date | string;
};
export type EnvironmentCreateInput = {
    id?: string;
    name: string;
    slug: string;
    isDefault?: boolean;
    sortOrder?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    project?: Prisma.ProjectCreateNestedOneWithoutEnvironmentsInput;
    variables?: Prisma.VariableCreateNestedManyWithoutEnvironmentInput;
};
export type EnvironmentUncheckedCreateInput = {
    id?: string;
    projectId?: string | null;
    name: string;
    slug: string;
    isDefault?: boolean;
    sortOrder?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    variables?: Prisma.VariableUncheckedCreateNestedManyWithoutEnvironmentInput;
};
export type EnvironmentUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    slug?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    sortOrder?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    project?: Prisma.ProjectUpdateOneWithoutEnvironmentsNestedInput;
    variables?: Prisma.VariableUpdateManyWithoutEnvironmentNestedInput;
};
export type EnvironmentUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    slug?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    sortOrder?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    variables?: Prisma.VariableUncheckedUpdateManyWithoutEnvironmentNestedInput;
};
export type EnvironmentCreateManyInput = {
    id?: string;
    projectId?: string | null;
    name: string;
    slug: string;
    isDefault?: boolean;
    sortOrder?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type EnvironmentUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    slug?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    sortOrder?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type EnvironmentUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    slug?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    sortOrder?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type EnvironmentListRelationFilter = {
    every?: Prisma.EnvironmentWhereInput;
    some?: Prisma.EnvironmentWhereInput;
    none?: Prisma.EnvironmentWhereInput;
};
export type EnvironmentOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type EnvironmentCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    slug?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    sortOrder?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type EnvironmentAvgOrderByAggregateInput = {
    sortOrder?: Prisma.SortOrder;
};
export type EnvironmentMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    slug?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    sortOrder?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type EnvironmentMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    slug?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    sortOrder?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type EnvironmentSumOrderByAggregateInput = {
    sortOrder?: Prisma.SortOrder;
};
export type EnvironmentNullableScalarRelationFilter = {
    is?: Prisma.EnvironmentWhereInput | null;
    isNot?: Prisma.EnvironmentWhereInput | null;
};
export type EnvironmentCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.EnvironmentCreateWithoutProjectInput, Prisma.EnvironmentUncheckedCreateWithoutProjectInput> | Prisma.EnvironmentCreateWithoutProjectInput[] | Prisma.EnvironmentUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.EnvironmentCreateOrConnectWithoutProjectInput | Prisma.EnvironmentCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.EnvironmentCreateManyProjectInputEnvelope;
    connect?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
};
export type EnvironmentUncheckedCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.EnvironmentCreateWithoutProjectInput, Prisma.EnvironmentUncheckedCreateWithoutProjectInput> | Prisma.EnvironmentCreateWithoutProjectInput[] | Prisma.EnvironmentUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.EnvironmentCreateOrConnectWithoutProjectInput | Prisma.EnvironmentCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.EnvironmentCreateManyProjectInputEnvelope;
    connect?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
};
export type EnvironmentUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.EnvironmentCreateWithoutProjectInput, Prisma.EnvironmentUncheckedCreateWithoutProjectInput> | Prisma.EnvironmentCreateWithoutProjectInput[] | Prisma.EnvironmentUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.EnvironmentCreateOrConnectWithoutProjectInput | Prisma.EnvironmentCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.EnvironmentUpsertWithWhereUniqueWithoutProjectInput | Prisma.EnvironmentUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.EnvironmentCreateManyProjectInputEnvelope;
    set?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
    disconnect?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
    delete?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
    connect?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
    update?: Prisma.EnvironmentUpdateWithWhereUniqueWithoutProjectInput | Prisma.EnvironmentUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.EnvironmentUpdateManyWithWhereWithoutProjectInput | Prisma.EnvironmentUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.EnvironmentScalarWhereInput | Prisma.EnvironmentScalarWhereInput[];
};
export type EnvironmentUncheckedUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.EnvironmentCreateWithoutProjectInput, Prisma.EnvironmentUncheckedCreateWithoutProjectInput> | Prisma.EnvironmentCreateWithoutProjectInput[] | Prisma.EnvironmentUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.EnvironmentCreateOrConnectWithoutProjectInput | Prisma.EnvironmentCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.EnvironmentUpsertWithWhereUniqueWithoutProjectInput | Prisma.EnvironmentUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.EnvironmentCreateManyProjectInputEnvelope;
    set?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
    disconnect?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
    delete?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
    connect?: Prisma.EnvironmentWhereUniqueInput | Prisma.EnvironmentWhereUniqueInput[];
    update?: Prisma.EnvironmentUpdateWithWhereUniqueWithoutProjectInput | Prisma.EnvironmentUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.EnvironmentUpdateManyWithWhereWithoutProjectInput | Prisma.EnvironmentUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.EnvironmentScalarWhereInput | Prisma.EnvironmentScalarWhereInput[];
};
export type BoolFieldUpdateOperationsInput = {
    set?: boolean;
};
export type IntFieldUpdateOperationsInput = {
    set?: number;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
};
export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null;
};
export type EnvironmentCreateNestedOneWithoutVariablesInput = {
    create?: Prisma.XOR<Prisma.EnvironmentCreateWithoutVariablesInput, Prisma.EnvironmentUncheckedCreateWithoutVariablesInput>;
    connectOrCreate?: Prisma.EnvironmentCreateOrConnectWithoutVariablesInput;
    connect?: Prisma.EnvironmentWhereUniqueInput;
};
export type EnvironmentUpdateOneWithoutVariablesNestedInput = {
    create?: Prisma.XOR<Prisma.EnvironmentCreateWithoutVariablesInput, Prisma.EnvironmentUncheckedCreateWithoutVariablesInput>;
    connectOrCreate?: Prisma.EnvironmentCreateOrConnectWithoutVariablesInput;
    upsert?: Prisma.EnvironmentUpsertWithoutVariablesInput;
    disconnect?: Prisma.EnvironmentWhereInput | boolean;
    delete?: Prisma.EnvironmentWhereInput | boolean;
    connect?: Prisma.EnvironmentWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.EnvironmentUpdateToOneWithWhereWithoutVariablesInput, Prisma.EnvironmentUpdateWithoutVariablesInput>, Prisma.EnvironmentUncheckedUpdateWithoutVariablesInput>;
};
export type EnvironmentCreateWithoutProjectInput = {
    id?: string;
    name: string;
    slug: string;
    isDefault?: boolean;
    sortOrder?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    variables?: Prisma.VariableCreateNestedManyWithoutEnvironmentInput;
};
export type EnvironmentUncheckedCreateWithoutProjectInput = {
    id?: string;
    name: string;
    slug: string;
    isDefault?: boolean;
    sortOrder?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    variables?: Prisma.VariableUncheckedCreateNestedManyWithoutEnvironmentInput;
};
export type EnvironmentCreateOrConnectWithoutProjectInput = {
    where: Prisma.EnvironmentWhereUniqueInput;
    create: Prisma.XOR<Prisma.EnvironmentCreateWithoutProjectInput, Prisma.EnvironmentUncheckedCreateWithoutProjectInput>;
};
export type EnvironmentCreateManyProjectInputEnvelope = {
    data: Prisma.EnvironmentCreateManyProjectInput | Prisma.EnvironmentCreateManyProjectInput[];
    skipDuplicates?: boolean;
};
export type EnvironmentUpsertWithWhereUniqueWithoutProjectInput = {
    where: Prisma.EnvironmentWhereUniqueInput;
    update: Prisma.XOR<Prisma.EnvironmentUpdateWithoutProjectInput, Prisma.EnvironmentUncheckedUpdateWithoutProjectInput>;
    create: Prisma.XOR<Prisma.EnvironmentCreateWithoutProjectInput, Prisma.EnvironmentUncheckedCreateWithoutProjectInput>;
};
export type EnvironmentUpdateWithWhereUniqueWithoutProjectInput = {
    where: Prisma.EnvironmentWhereUniqueInput;
    data: Prisma.XOR<Prisma.EnvironmentUpdateWithoutProjectInput, Prisma.EnvironmentUncheckedUpdateWithoutProjectInput>;
};
export type EnvironmentUpdateManyWithWhereWithoutProjectInput = {
    where: Prisma.EnvironmentScalarWhereInput;
    data: Prisma.XOR<Prisma.EnvironmentUpdateManyMutationInput, Prisma.EnvironmentUncheckedUpdateManyWithoutProjectInput>;
};
export type EnvironmentScalarWhereInput = {
    AND?: Prisma.EnvironmentScalarWhereInput | Prisma.EnvironmentScalarWhereInput[];
    OR?: Prisma.EnvironmentScalarWhereInput[];
    NOT?: Prisma.EnvironmentScalarWhereInput | Prisma.EnvironmentScalarWhereInput[];
    id?: Prisma.StringFilter<"Environment"> | string;
    projectId?: Prisma.StringNullableFilter<"Environment"> | string | null;
    name?: Prisma.StringFilter<"Environment"> | string;
    slug?: Prisma.StringFilter<"Environment"> | string;
    isDefault?: Prisma.BoolFilter<"Environment"> | boolean;
    sortOrder?: Prisma.IntFilter<"Environment"> | number;
    createdAt?: Prisma.DateTimeFilter<"Environment"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Environment"> | Date | string;
};
export type EnvironmentCreateWithoutVariablesInput = {
    id?: string;
    name: string;
    slug: string;
    isDefault?: boolean;
    sortOrder?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    project?: Prisma.ProjectCreateNestedOneWithoutEnvironmentsInput;
};
export type EnvironmentUncheckedCreateWithoutVariablesInput = {
    id?: string;
    projectId?: string | null;
    name: string;
    slug: string;
    isDefault?: boolean;
    sortOrder?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type EnvironmentCreateOrConnectWithoutVariablesInput = {
    where: Prisma.EnvironmentWhereUniqueInput;
    create: Prisma.XOR<Prisma.EnvironmentCreateWithoutVariablesInput, Prisma.EnvironmentUncheckedCreateWithoutVariablesInput>;
};
export type EnvironmentUpsertWithoutVariablesInput = {
    update: Prisma.XOR<Prisma.EnvironmentUpdateWithoutVariablesInput, Prisma.EnvironmentUncheckedUpdateWithoutVariablesInput>;
    create: Prisma.XOR<Prisma.EnvironmentCreateWithoutVariablesInput, Prisma.EnvironmentUncheckedCreateWithoutVariablesInput>;
    where?: Prisma.EnvironmentWhereInput;
};
export type EnvironmentUpdateToOneWithWhereWithoutVariablesInput = {
    where?: Prisma.EnvironmentWhereInput;
    data: Prisma.XOR<Prisma.EnvironmentUpdateWithoutVariablesInput, Prisma.EnvironmentUncheckedUpdateWithoutVariablesInput>;
};
export type EnvironmentUpdateWithoutVariablesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    slug?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    sortOrder?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    project?: Prisma.ProjectUpdateOneWithoutEnvironmentsNestedInput;
};
export type EnvironmentUncheckedUpdateWithoutVariablesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    slug?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    sortOrder?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type EnvironmentCreateManyProjectInput = {
    id?: string;
    name: string;
    slug: string;
    isDefault?: boolean;
    sortOrder?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type EnvironmentUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    slug?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    sortOrder?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    variables?: Prisma.VariableUpdateManyWithoutEnvironmentNestedInput;
};
export type EnvironmentUncheckedUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    slug?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    sortOrder?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    variables?: Prisma.VariableUncheckedUpdateManyWithoutEnvironmentNestedInput;
};
export type EnvironmentUncheckedUpdateManyWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    slug?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    sortOrder?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
/**
 * Count Type EnvironmentCountOutputType
 */
export type EnvironmentCountOutputType = {
    variables: number;
};
export type EnvironmentCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    variables?: boolean | EnvironmentCountOutputTypeCountVariablesArgs;
};
/**
 * EnvironmentCountOutputType without action
 */
export type EnvironmentCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EnvironmentCountOutputType
     */
    select?: Prisma.EnvironmentCountOutputTypeSelect<ExtArgs> | null;
};
/**
 * EnvironmentCountOutputType without action
 */
export type EnvironmentCountOutputTypeCountVariablesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.VariableWhereInput;
};
export type EnvironmentSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    projectId?: boolean;
    name?: boolean;
    slug?: boolean;
    isDefault?: boolean;
    sortOrder?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    project?: boolean | Prisma.Environment$projectArgs<ExtArgs>;
    variables?: boolean | Prisma.Environment$variablesArgs<ExtArgs>;
    _count?: boolean | Prisma.EnvironmentCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["environment"]>;
export type EnvironmentSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    projectId?: boolean;
    name?: boolean;
    slug?: boolean;
    isDefault?: boolean;
    sortOrder?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    project?: boolean | Prisma.Environment$projectArgs<ExtArgs>;
}, ExtArgs["result"]["environment"]>;
export type EnvironmentSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    projectId?: boolean;
    name?: boolean;
    slug?: boolean;
    isDefault?: boolean;
    sortOrder?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    project?: boolean | Prisma.Environment$projectArgs<ExtArgs>;
}, ExtArgs["result"]["environment"]>;
export type EnvironmentSelectScalar = {
    id?: boolean;
    projectId?: boolean;
    name?: boolean;
    slug?: boolean;
    isDefault?: boolean;
    sortOrder?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type EnvironmentOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "projectId" | "name" | "slug" | "isDefault" | "sortOrder" | "createdAt" | "updatedAt", ExtArgs["result"]["environment"]>;
export type EnvironmentInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    project?: boolean | Prisma.Environment$projectArgs<ExtArgs>;
    variables?: boolean | Prisma.Environment$variablesArgs<ExtArgs>;
    _count?: boolean | Prisma.EnvironmentCountOutputTypeDefaultArgs<ExtArgs>;
};
export type EnvironmentIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    project?: boolean | Prisma.Environment$projectArgs<ExtArgs>;
};
export type EnvironmentIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    project?: boolean | Prisma.Environment$projectArgs<ExtArgs>;
};
export type $EnvironmentPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Environment";
    objects: {
        project: Prisma.$ProjectPayload<ExtArgs> | null;
        variables: Prisma.$VariablePayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        projectId: string | null;
        name: string;
        /**
         * URL-safe slug: development | staging | production | custom
         */
        slug: string;
        isDefault: boolean;
        sortOrder: number;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["environment"]>;
    composites: {};
};
export type EnvironmentGetPayload<S extends boolean | null | undefined | EnvironmentDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload, S>;
export type EnvironmentCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<EnvironmentFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: EnvironmentCountAggregateInputType | true;
};
export interface EnvironmentDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Environment'];
        meta: {
            name: 'Environment';
        };
    };
    /**
     * Find zero or one Environment that matches the filter.
     * @param {EnvironmentFindUniqueArgs} args - Arguments to find a Environment
     * @example
     * // Get one Environment
     * const environment = await prisma.environment.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends EnvironmentFindUniqueArgs>(args: Prisma.SelectSubset<T, EnvironmentFindUniqueArgs<ExtArgs>>): Prisma.Prisma__EnvironmentClient<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Environment that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {EnvironmentFindUniqueOrThrowArgs} args - Arguments to find a Environment
     * @example
     * // Get one Environment
     * const environment = await prisma.environment.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends EnvironmentFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, EnvironmentFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__EnvironmentClient<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Environment that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnvironmentFindFirstArgs} args - Arguments to find a Environment
     * @example
     * // Get one Environment
     * const environment = await prisma.environment.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends EnvironmentFindFirstArgs>(args?: Prisma.SelectSubset<T, EnvironmentFindFirstArgs<ExtArgs>>): Prisma.Prisma__EnvironmentClient<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Environment that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnvironmentFindFirstOrThrowArgs} args - Arguments to find a Environment
     * @example
     * // Get one Environment
     * const environment = await prisma.environment.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends EnvironmentFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, EnvironmentFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__EnvironmentClient<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Environments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnvironmentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Environments
     * const environments = await prisma.environment.findMany()
     *
     * // Get first 10 Environments
     * const environments = await prisma.environment.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const environmentWithIdOnly = await prisma.environment.findMany({ select: { id: true } })
     *
     */
    findMany<T extends EnvironmentFindManyArgs>(args?: Prisma.SelectSubset<T, EnvironmentFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Environment.
     * @param {EnvironmentCreateArgs} args - Arguments to create a Environment.
     * @example
     * // Create one Environment
     * const Environment = await prisma.environment.create({
     *   data: {
     *     // ... data to create a Environment
     *   }
     * })
     *
     */
    create<T extends EnvironmentCreateArgs>(args: Prisma.SelectSubset<T, EnvironmentCreateArgs<ExtArgs>>): Prisma.Prisma__EnvironmentClient<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Environments.
     * @param {EnvironmentCreateManyArgs} args - Arguments to create many Environments.
     * @example
     * // Create many Environments
     * const environment = await prisma.environment.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends EnvironmentCreateManyArgs>(args?: Prisma.SelectSubset<T, EnvironmentCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Environments and returns the data saved in the database.
     * @param {EnvironmentCreateManyAndReturnArgs} args - Arguments to create many Environments.
     * @example
     * // Create many Environments
     * const environment = await prisma.environment.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Environments and only return the `id`
     * const environmentWithIdOnly = await prisma.environment.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends EnvironmentCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, EnvironmentCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Environment.
     * @param {EnvironmentDeleteArgs} args - Arguments to delete one Environment.
     * @example
     * // Delete one Environment
     * const Environment = await prisma.environment.delete({
     *   where: {
     *     // ... filter to delete one Environment
     *   }
     * })
     *
     */
    delete<T extends EnvironmentDeleteArgs>(args: Prisma.SelectSubset<T, EnvironmentDeleteArgs<ExtArgs>>): Prisma.Prisma__EnvironmentClient<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Environment.
     * @param {EnvironmentUpdateArgs} args - Arguments to update one Environment.
     * @example
     * // Update one Environment
     * const environment = await prisma.environment.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends EnvironmentUpdateArgs>(args: Prisma.SelectSubset<T, EnvironmentUpdateArgs<ExtArgs>>): Prisma.Prisma__EnvironmentClient<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Environments.
     * @param {EnvironmentDeleteManyArgs} args - Arguments to filter Environments to delete.
     * @example
     * // Delete a few Environments
     * const { count } = await prisma.environment.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends EnvironmentDeleteManyArgs>(args?: Prisma.SelectSubset<T, EnvironmentDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Environments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnvironmentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Environments
     * const environment = await prisma.environment.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends EnvironmentUpdateManyArgs>(args: Prisma.SelectSubset<T, EnvironmentUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Environments and returns the data updated in the database.
     * @param {EnvironmentUpdateManyAndReturnArgs} args - Arguments to update many Environments.
     * @example
     * // Update many Environments
     * const environment = await prisma.environment.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Environments and only return the `id`
     * const environmentWithIdOnly = await prisma.environment.updateManyAndReturn({
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
    updateManyAndReturn<T extends EnvironmentUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, EnvironmentUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Environment.
     * @param {EnvironmentUpsertArgs} args - Arguments to update or create a Environment.
     * @example
     * // Update or create a Environment
     * const environment = await prisma.environment.upsert({
     *   create: {
     *     // ... data to create a Environment
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Environment we want to update
     *   }
     * })
     */
    upsert<T extends EnvironmentUpsertArgs>(args: Prisma.SelectSubset<T, EnvironmentUpsertArgs<ExtArgs>>): Prisma.Prisma__EnvironmentClient<runtime.Types.Result.GetResult<Prisma.$EnvironmentPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Environments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnvironmentCountArgs} args - Arguments to filter Environments to count.
     * @example
     * // Count the number of Environments
     * const count = await prisma.environment.count({
     *   where: {
     *     // ... the filter for the Environments we want to count
     *   }
     * })
    **/
    count<T extends EnvironmentCountArgs>(args?: Prisma.Subset<T, EnvironmentCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], EnvironmentCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Environment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnvironmentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends EnvironmentAggregateArgs>(args: Prisma.Subset<T, EnvironmentAggregateArgs>): Prisma.PrismaPromise<GetEnvironmentAggregateType<T>>;
    /**
     * Group by Environment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnvironmentGroupByArgs} args - Group by arguments.
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
    groupBy<T extends EnvironmentGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: EnvironmentGroupByArgs['orderBy'];
    } : {
        orderBy?: EnvironmentGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, EnvironmentGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetEnvironmentGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Environment model
     */
    readonly fields: EnvironmentFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Environment.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__EnvironmentClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    project<T extends Prisma.Environment$projectArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Environment$projectArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    variables<T extends Prisma.Environment$variablesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Environment$variablesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$VariablePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
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
 * Fields of the Environment model
 */
export interface EnvironmentFieldRefs {
    readonly id: Prisma.FieldRef<"Environment", 'String'>;
    readonly projectId: Prisma.FieldRef<"Environment", 'String'>;
    readonly name: Prisma.FieldRef<"Environment", 'String'>;
    readonly slug: Prisma.FieldRef<"Environment", 'String'>;
    readonly isDefault: Prisma.FieldRef<"Environment", 'Boolean'>;
    readonly sortOrder: Prisma.FieldRef<"Environment", 'Int'>;
    readonly createdAt: Prisma.FieldRef<"Environment", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"Environment", 'DateTime'>;
}
/**
 * Environment findUnique
 */
export type EnvironmentFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Environment to fetch.
     */
    where: Prisma.EnvironmentWhereUniqueInput;
};
/**
 * Environment findUniqueOrThrow
 */
export type EnvironmentFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Environment to fetch.
     */
    where: Prisma.EnvironmentWhereUniqueInput;
};
/**
 * Environment findFirst
 */
export type EnvironmentFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Environment to fetch.
     */
    where?: Prisma.EnvironmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Environments to fetch.
     */
    orderBy?: Prisma.EnvironmentOrderByWithRelationInput | Prisma.EnvironmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Environments.
     */
    cursor?: Prisma.EnvironmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Environments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Environments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Environments.
     */
    distinct?: Prisma.EnvironmentScalarFieldEnum | Prisma.EnvironmentScalarFieldEnum[];
};
/**
 * Environment findFirstOrThrow
 */
export type EnvironmentFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Environment to fetch.
     */
    where?: Prisma.EnvironmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Environments to fetch.
     */
    orderBy?: Prisma.EnvironmentOrderByWithRelationInput | Prisma.EnvironmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Environments.
     */
    cursor?: Prisma.EnvironmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Environments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Environments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Environments.
     */
    distinct?: Prisma.EnvironmentScalarFieldEnum | Prisma.EnvironmentScalarFieldEnum[];
};
/**
 * Environment findMany
 */
export type EnvironmentFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Environments to fetch.
     */
    where?: Prisma.EnvironmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Environments to fetch.
     */
    orderBy?: Prisma.EnvironmentOrderByWithRelationInput | Prisma.EnvironmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Environments.
     */
    cursor?: Prisma.EnvironmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Environments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Environments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Environments.
     */
    distinct?: Prisma.EnvironmentScalarFieldEnum | Prisma.EnvironmentScalarFieldEnum[];
};
/**
 * Environment create
 */
export type EnvironmentCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a Environment.
     */
    data: Prisma.XOR<Prisma.EnvironmentCreateInput, Prisma.EnvironmentUncheckedCreateInput>;
};
/**
 * Environment createMany
 */
export type EnvironmentCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Environments.
     */
    data: Prisma.EnvironmentCreateManyInput | Prisma.EnvironmentCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Environment createManyAndReturn
 */
export type EnvironmentCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Environment
     */
    select?: Prisma.EnvironmentSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Environment
     */
    omit?: Prisma.EnvironmentOmit<ExtArgs> | null;
    /**
     * The data used to create many Environments.
     */
    data: Prisma.EnvironmentCreateManyInput | Prisma.EnvironmentCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnvironmentIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * Environment update
 */
export type EnvironmentUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a Environment.
     */
    data: Prisma.XOR<Prisma.EnvironmentUpdateInput, Prisma.EnvironmentUncheckedUpdateInput>;
    /**
     * Choose, which Environment to update.
     */
    where: Prisma.EnvironmentWhereUniqueInput;
};
/**
 * Environment updateMany
 */
export type EnvironmentUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Environments.
     */
    data: Prisma.XOR<Prisma.EnvironmentUpdateManyMutationInput, Prisma.EnvironmentUncheckedUpdateManyInput>;
    /**
     * Filter which Environments to update
     */
    where?: Prisma.EnvironmentWhereInput;
    /**
     * Limit how many Environments to update.
     */
    limit?: number;
};
/**
 * Environment updateManyAndReturn
 */
export type EnvironmentUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Environment
     */
    select?: Prisma.EnvironmentSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Environment
     */
    omit?: Prisma.EnvironmentOmit<ExtArgs> | null;
    /**
     * The data used to update Environments.
     */
    data: Prisma.XOR<Prisma.EnvironmentUpdateManyMutationInput, Prisma.EnvironmentUncheckedUpdateManyInput>;
    /**
     * Filter which Environments to update
     */
    where?: Prisma.EnvironmentWhereInput;
    /**
     * Limit how many Environments to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnvironmentIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * Environment upsert
 */
export type EnvironmentUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the Environment to update in case it exists.
     */
    where: Prisma.EnvironmentWhereUniqueInput;
    /**
     * In case the Environment found by the `where` argument doesn't exist, create a new Environment with this data.
     */
    create: Prisma.XOR<Prisma.EnvironmentCreateInput, Prisma.EnvironmentUncheckedCreateInput>;
    /**
     * In case the Environment was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.EnvironmentUpdateInput, Prisma.EnvironmentUncheckedUpdateInput>;
};
/**
 * Environment delete
 */
export type EnvironmentDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which Environment to delete.
     */
    where: Prisma.EnvironmentWhereUniqueInput;
};
/**
 * Environment deleteMany
 */
export type EnvironmentDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Environments to delete
     */
    where?: Prisma.EnvironmentWhereInput;
    /**
     * Limit how many Environments to delete.
     */
    limit?: number;
};
/**
 * Environment.project
 */
export type Environment$projectArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
 * Environment.variables
 */
export type Environment$variablesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
 * Environment without action
 */
export type EnvironmentDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
