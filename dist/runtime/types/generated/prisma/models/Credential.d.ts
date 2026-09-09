import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model Credential
 *
 */
export type CredentialModel = runtime.Types.Result.DefaultSelection<Prisma.$CredentialPayload>;
export type AggregateCredential = {
    _count: CredentialCountAggregateOutputType | null;
    _min: CredentialMinAggregateOutputType | null;
    _max: CredentialMaxAggregateOutputType | null;
};
export type CredentialMinAggregateOutputType = {
    id: string | null;
    userId: string | null;
    projectId: string | null;
    name: string | null;
    type: string | null;
    dataEncrypted: string | null;
    secretProviderId: string | null;
    externalRef: string | null;
    createdAt: Date | null;
};
export type CredentialMaxAggregateOutputType = {
    id: string | null;
    userId: string | null;
    projectId: string | null;
    name: string | null;
    type: string | null;
    dataEncrypted: string | null;
    secretProviderId: string | null;
    externalRef: string | null;
    createdAt: Date | null;
};
export type CredentialCountAggregateOutputType = {
    id: number;
    userId: number;
    projectId: number;
    name: number;
    type: number;
    dataEncrypted: number;
    secretProviderId: number;
    externalRef: number;
    createdAt: number;
    _all: number;
};
export type CredentialMinAggregateInputType = {
    id?: true;
    userId?: true;
    projectId?: true;
    name?: true;
    type?: true;
    dataEncrypted?: true;
    secretProviderId?: true;
    externalRef?: true;
    createdAt?: true;
};
export type CredentialMaxAggregateInputType = {
    id?: true;
    userId?: true;
    projectId?: true;
    name?: true;
    type?: true;
    dataEncrypted?: true;
    secretProviderId?: true;
    externalRef?: true;
    createdAt?: true;
};
export type CredentialCountAggregateInputType = {
    id?: true;
    userId?: true;
    projectId?: true;
    name?: true;
    type?: true;
    dataEncrypted?: true;
    secretProviderId?: true;
    externalRef?: true;
    createdAt?: true;
    _all?: true;
};
export type CredentialAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Credential to aggregate.
     */
    where?: Prisma.CredentialWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Credentials to fetch.
     */
    orderBy?: Prisma.CredentialOrderByWithRelationInput | Prisma.CredentialOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.CredentialWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Credentials from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Credentials.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Credentials
    **/
    _count?: true | CredentialCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: CredentialMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: CredentialMaxAggregateInputType;
};
export type GetCredentialAggregateType<T extends CredentialAggregateArgs> = {
    [P in keyof T & keyof AggregateCredential]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateCredential[P]> : Prisma.GetScalarType<T[P], AggregateCredential[P]>;
};
export type CredentialGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.CredentialWhereInput;
    orderBy?: Prisma.CredentialOrderByWithAggregationInput | Prisma.CredentialOrderByWithAggregationInput[];
    by: Prisma.CredentialScalarFieldEnum[] | Prisma.CredentialScalarFieldEnum;
    having?: Prisma.CredentialScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: CredentialCountAggregateInputType | true;
    _min?: CredentialMinAggregateInputType;
    _max?: CredentialMaxAggregateInputType;
};
export type CredentialGroupByOutputType = {
    id: string;
    userId: string;
    projectId: string;
    name: string;
    type: string;
    dataEncrypted: string;
    secretProviderId: string | null;
    externalRef: string | null;
    createdAt: Date;
    _count: CredentialCountAggregateOutputType | null;
    _min: CredentialMinAggregateOutputType | null;
    _max: CredentialMaxAggregateOutputType | null;
};
export type GetCredentialGroupByPayload<T extends CredentialGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<CredentialGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof CredentialGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], CredentialGroupByOutputType[P]> : Prisma.GetScalarType<T[P], CredentialGroupByOutputType[P]>;
}>>;
export type CredentialWhereInput = {
    AND?: Prisma.CredentialWhereInput | Prisma.CredentialWhereInput[];
    OR?: Prisma.CredentialWhereInput[];
    NOT?: Prisma.CredentialWhereInput | Prisma.CredentialWhereInput[];
    id?: Prisma.StringFilter<"Credential"> | string;
    userId?: Prisma.StringFilter<"Credential"> | string;
    projectId?: Prisma.StringFilter<"Credential"> | string;
    name?: Prisma.StringFilter<"Credential"> | string;
    type?: Prisma.StringFilter<"Credential"> | string;
    dataEncrypted?: Prisma.StringFilter<"Credential"> | string;
    secretProviderId?: Prisma.StringNullableFilter<"Credential"> | string | null;
    externalRef?: Prisma.StringNullableFilter<"Credential"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Credential"> | Date | string;
    user?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
    project?: Prisma.XOR<Prisma.ProjectScalarRelationFilter, Prisma.ProjectWhereInput>;
    secretProvider?: Prisma.XOR<Prisma.SecretProviderNullableScalarRelationFilter, Prisma.SecretProviderWhereInput> | null;
};
export type CredentialOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    dataEncrypted?: Prisma.SortOrder;
    secretProviderId?: Prisma.SortOrderInput | Prisma.SortOrder;
    externalRef?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    user?: Prisma.UserOrderByWithRelationInput;
    project?: Prisma.ProjectOrderByWithRelationInput;
    secretProvider?: Prisma.SecretProviderOrderByWithRelationInput;
};
export type CredentialWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.CredentialWhereInput | Prisma.CredentialWhereInput[];
    OR?: Prisma.CredentialWhereInput[];
    NOT?: Prisma.CredentialWhereInput | Prisma.CredentialWhereInput[];
    userId?: Prisma.StringFilter<"Credential"> | string;
    projectId?: Prisma.StringFilter<"Credential"> | string;
    name?: Prisma.StringFilter<"Credential"> | string;
    type?: Prisma.StringFilter<"Credential"> | string;
    dataEncrypted?: Prisma.StringFilter<"Credential"> | string;
    secretProviderId?: Prisma.StringNullableFilter<"Credential"> | string | null;
    externalRef?: Prisma.StringNullableFilter<"Credential"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Credential"> | Date | string;
    user?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
    project?: Prisma.XOR<Prisma.ProjectScalarRelationFilter, Prisma.ProjectWhereInput>;
    secretProvider?: Prisma.XOR<Prisma.SecretProviderNullableScalarRelationFilter, Prisma.SecretProviderWhereInput> | null;
}, "id">;
export type CredentialOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    dataEncrypted?: Prisma.SortOrder;
    secretProviderId?: Prisma.SortOrderInput | Prisma.SortOrder;
    externalRef?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    _count?: Prisma.CredentialCountOrderByAggregateInput;
    _max?: Prisma.CredentialMaxOrderByAggregateInput;
    _min?: Prisma.CredentialMinOrderByAggregateInput;
};
export type CredentialScalarWhereWithAggregatesInput = {
    AND?: Prisma.CredentialScalarWhereWithAggregatesInput | Prisma.CredentialScalarWhereWithAggregatesInput[];
    OR?: Prisma.CredentialScalarWhereWithAggregatesInput[];
    NOT?: Prisma.CredentialScalarWhereWithAggregatesInput | Prisma.CredentialScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Credential"> | string;
    userId?: Prisma.StringWithAggregatesFilter<"Credential"> | string;
    projectId?: Prisma.StringWithAggregatesFilter<"Credential"> | string;
    name?: Prisma.StringWithAggregatesFilter<"Credential"> | string;
    type?: Prisma.StringWithAggregatesFilter<"Credential"> | string;
    dataEncrypted?: Prisma.StringWithAggregatesFilter<"Credential"> | string;
    secretProviderId?: Prisma.StringNullableWithAggregatesFilter<"Credential"> | string | null;
    externalRef?: Prisma.StringNullableWithAggregatesFilter<"Credential"> | string | null;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"Credential"> | Date | string;
};
export type CredentialCreateInput = {
    id?: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    externalRef?: string | null;
    createdAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutCredentialsInput;
    project: Prisma.ProjectCreateNestedOneWithoutCredentialsInput;
    secretProvider?: Prisma.SecretProviderCreateNestedOneWithoutCredentialsInput;
};
export type CredentialUncheckedCreateInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    secretProviderId?: string | null;
    externalRef?: string | null;
    createdAt?: Date | string;
};
export type CredentialUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutCredentialsNestedInput;
    project?: Prisma.ProjectUpdateOneRequiredWithoutCredentialsNestedInput;
    secretProvider?: Prisma.SecretProviderUpdateOneWithoutCredentialsNestedInput;
};
export type CredentialUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    secretProviderId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CredentialCreateManyInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    secretProviderId?: string | null;
    externalRef?: string | null;
    createdAt?: Date | string;
};
export type CredentialUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CredentialUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    secretProviderId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CredentialListRelationFilter = {
    every?: Prisma.CredentialWhereInput;
    some?: Prisma.CredentialWhereInput;
    none?: Prisma.CredentialWhereInput;
};
export type CredentialOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type CredentialCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    dataEncrypted?: Prisma.SortOrder;
    secretProviderId?: Prisma.SortOrder;
    externalRef?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type CredentialMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    dataEncrypted?: Prisma.SortOrder;
    secretProviderId?: Prisma.SortOrder;
    externalRef?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type CredentialMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    projectId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    dataEncrypted?: Prisma.SortOrder;
    secretProviderId?: Prisma.SortOrder;
    externalRef?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type CredentialCreateNestedManyWithoutUserInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutUserInput, Prisma.CredentialUncheckedCreateWithoutUserInput> | Prisma.CredentialCreateWithoutUserInput[] | Prisma.CredentialUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutUserInput | Prisma.CredentialCreateOrConnectWithoutUserInput[];
    createMany?: Prisma.CredentialCreateManyUserInputEnvelope;
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
};
export type CredentialUncheckedCreateNestedManyWithoutUserInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutUserInput, Prisma.CredentialUncheckedCreateWithoutUserInput> | Prisma.CredentialCreateWithoutUserInput[] | Prisma.CredentialUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutUserInput | Prisma.CredentialCreateOrConnectWithoutUserInput[];
    createMany?: Prisma.CredentialCreateManyUserInputEnvelope;
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
};
export type CredentialUpdateManyWithoutUserNestedInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutUserInput, Prisma.CredentialUncheckedCreateWithoutUserInput> | Prisma.CredentialCreateWithoutUserInput[] | Prisma.CredentialUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutUserInput | Prisma.CredentialCreateOrConnectWithoutUserInput[];
    upsert?: Prisma.CredentialUpsertWithWhereUniqueWithoutUserInput | Prisma.CredentialUpsertWithWhereUniqueWithoutUserInput[];
    createMany?: Prisma.CredentialCreateManyUserInputEnvelope;
    set?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    disconnect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    delete?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    update?: Prisma.CredentialUpdateWithWhereUniqueWithoutUserInput | Prisma.CredentialUpdateWithWhereUniqueWithoutUserInput[];
    updateMany?: Prisma.CredentialUpdateManyWithWhereWithoutUserInput | Prisma.CredentialUpdateManyWithWhereWithoutUserInput[];
    deleteMany?: Prisma.CredentialScalarWhereInput | Prisma.CredentialScalarWhereInput[];
};
export type CredentialUncheckedUpdateManyWithoutUserNestedInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutUserInput, Prisma.CredentialUncheckedCreateWithoutUserInput> | Prisma.CredentialCreateWithoutUserInput[] | Prisma.CredentialUncheckedCreateWithoutUserInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutUserInput | Prisma.CredentialCreateOrConnectWithoutUserInput[];
    upsert?: Prisma.CredentialUpsertWithWhereUniqueWithoutUserInput | Prisma.CredentialUpsertWithWhereUniqueWithoutUserInput[];
    createMany?: Prisma.CredentialCreateManyUserInputEnvelope;
    set?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    disconnect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    delete?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    update?: Prisma.CredentialUpdateWithWhereUniqueWithoutUserInput | Prisma.CredentialUpdateWithWhereUniqueWithoutUserInput[];
    updateMany?: Prisma.CredentialUpdateManyWithWhereWithoutUserInput | Prisma.CredentialUpdateManyWithWhereWithoutUserInput[];
    deleteMany?: Prisma.CredentialScalarWhereInput | Prisma.CredentialScalarWhereInput[];
};
export type CredentialCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutProjectInput, Prisma.CredentialUncheckedCreateWithoutProjectInput> | Prisma.CredentialCreateWithoutProjectInput[] | Prisma.CredentialUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutProjectInput | Prisma.CredentialCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.CredentialCreateManyProjectInputEnvelope;
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
};
export type CredentialUncheckedCreateNestedManyWithoutProjectInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutProjectInput, Prisma.CredentialUncheckedCreateWithoutProjectInput> | Prisma.CredentialCreateWithoutProjectInput[] | Prisma.CredentialUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutProjectInput | Prisma.CredentialCreateOrConnectWithoutProjectInput[];
    createMany?: Prisma.CredentialCreateManyProjectInputEnvelope;
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
};
export type CredentialUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutProjectInput, Prisma.CredentialUncheckedCreateWithoutProjectInput> | Prisma.CredentialCreateWithoutProjectInput[] | Prisma.CredentialUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutProjectInput | Prisma.CredentialCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.CredentialUpsertWithWhereUniqueWithoutProjectInput | Prisma.CredentialUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.CredentialCreateManyProjectInputEnvelope;
    set?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    disconnect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    delete?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    update?: Prisma.CredentialUpdateWithWhereUniqueWithoutProjectInput | Prisma.CredentialUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.CredentialUpdateManyWithWhereWithoutProjectInput | Prisma.CredentialUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.CredentialScalarWhereInput | Prisma.CredentialScalarWhereInput[];
};
export type CredentialUncheckedUpdateManyWithoutProjectNestedInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutProjectInput, Prisma.CredentialUncheckedCreateWithoutProjectInput> | Prisma.CredentialCreateWithoutProjectInput[] | Prisma.CredentialUncheckedCreateWithoutProjectInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutProjectInput | Prisma.CredentialCreateOrConnectWithoutProjectInput[];
    upsert?: Prisma.CredentialUpsertWithWhereUniqueWithoutProjectInput | Prisma.CredentialUpsertWithWhereUniqueWithoutProjectInput[];
    createMany?: Prisma.CredentialCreateManyProjectInputEnvelope;
    set?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    disconnect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    delete?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    update?: Prisma.CredentialUpdateWithWhereUniqueWithoutProjectInput | Prisma.CredentialUpdateWithWhereUniqueWithoutProjectInput[];
    updateMany?: Prisma.CredentialUpdateManyWithWhereWithoutProjectInput | Prisma.CredentialUpdateManyWithWhereWithoutProjectInput[];
    deleteMany?: Prisma.CredentialScalarWhereInput | Prisma.CredentialScalarWhereInput[];
};
export type CredentialCreateNestedManyWithoutSecretProviderInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutSecretProviderInput, Prisma.CredentialUncheckedCreateWithoutSecretProviderInput> | Prisma.CredentialCreateWithoutSecretProviderInput[] | Prisma.CredentialUncheckedCreateWithoutSecretProviderInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutSecretProviderInput | Prisma.CredentialCreateOrConnectWithoutSecretProviderInput[];
    createMany?: Prisma.CredentialCreateManySecretProviderInputEnvelope;
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
};
export type CredentialUncheckedCreateNestedManyWithoutSecretProviderInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutSecretProviderInput, Prisma.CredentialUncheckedCreateWithoutSecretProviderInput> | Prisma.CredentialCreateWithoutSecretProviderInput[] | Prisma.CredentialUncheckedCreateWithoutSecretProviderInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutSecretProviderInput | Prisma.CredentialCreateOrConnectWithoutSecretProviderInput[];
    createMany?: Prisma.CredentialCreateManySecretProviderInputEnvelope;
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
};
export type CredentialUpdateManyWithoutSecretProviderNestedInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutSecretProviderInput, Prisma.CredentialUncheckedCreateWithoutSecretProviderInput> | Prisma.CredentialCreateWithoutSecretProviderInput[] | Prisma.CredentialUncheckedCreateWithoutSecretProviderInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutSecretProviderInput | Prisma.CredentialCreateOrConnectWithoutSecretProviderInput[];
    upsert?: Prisma.CredentialUpsertWithWhereUniqueWithoutSecretProviderInput | Prisma.CredentialUpsertWithWhereUniqueWithoutSecretProviderInput[];
    createMany?: Prisma.CredentialCreateManySecretProviderInputEnvelope;
    set?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    disconnect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    delete?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    update?: Prisma.CredentialUpdateWithWhereUniqueWithoutSecretProviderInput | Prisma.CredentialUpdateWithWhereUniqueWithoutSecretProviderInput[];
    updateMany?: Prisma.CredentialUpdateManyWithWhereWithoutSecretProviderInput | Prisma.CredentialUpdateManyWithWhereWithoutSecretProviderInput[];
    deleteMany?: Prisma.CredentialScalarWhereInput | Prisma.CredentialScalarWhereInput[];
};
export type CredentialUncheckedUpdateManyWithoutSecretProviderNestedInput = {
    create?: Prisma.XOR<Prisma.CredentialCreateWithoutSecretProviderInput, Prisma.CredentialUncheckedCreateWithoutSecretProviderInput> | Prisma.CredentialCreateWithoutSecretProviderInput[] | Prisma.CredentialUncheckedCreateWithoutSecretProviderInput[];
    connectOrCreate?: Prisma.CredentialCreateOrConnectWithoutSecretProviderInput | Prisma.CredentialCreateOrConnectWithoutSecretProviderInput[];
    upsert?: Prisma.CredentialUpsertWithWhereUniqueWithoutSecretProviderInput | Prisma.CredentialUpsertWithWhereUniqueWithoutSecretProviderInput[];
    createMany?: Prisma.CredentialCreateManySecretProviderInputEnvelope;
    set?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    disconnect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    delete?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    connect?: Prisma.CredentialWhereUniqueInput | Prisma.CredentialWhereUniqueInput[];
    update?: Prisma.CredentialUpdateWithWhereUniqueWithoutSecretProviderInput | Prisma.CredentialUpdateWithWhereUniqueWithoutSecretProviderInput[];
    updateMany?: Prisma.CredentialUpdateManyWithWhereWithoutSecretProviderInput | Prisma.CredentialUpdateManyWithWhereWithoutSecretProviderInput[];
    deleteMany?: Prisma.CredentialScalarWhereInput | Prisma.CredentialScalarWhereInput[];
};
export type CredentialCreateWithoutUserInput = {
    id?: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    externalRef?: string | null;
    createdAt?: Date | string;
    project: Prisma.ProjectCreateNestedOneWithoutCredentialsInput;
    secretProvider?: Prisma.SecretProviderCreateNestedOneWithoutCredentialsInput;
};
export type CredentialUncheckedCreateWithoutUserInput = {
    id?: string;
    projectId: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    secretProviderId?: string | null;
    externalRef?: string | null;
    createdAt?: Date | string;
};
export type CredentialCreateOrConnectWithoutUserInput = {
    where: Prisma.CredentialWhereUniqueInput;
    create: Prisma.XOR<Prisma.CredentialCreateWithoutUserInput, Prisma.CredentialUncheckedCreateWithoutUserInput>;
};
export type CredentialCreateManyUserInputEnvelope = {
    data: Prisma.CredentialCreateManyUserInput | Prisma.CredentialCreateManyUserInput[];
    skipDuplicates?: boolean;
};
export type CredentialUpsertWithWhereUniqueWithoutUserInput = {
    where: Prisma.CredentialWhereUniqueInput;
    update: Prisma.XOR<Prisma.CredentialUpdateWithoutUserInput, Prisma.CredentialUncheckedUpdateWithoutUserInput>;
    create: Prisma.XOR<Prisma.CredentialCreateWithoutUserInput, Prisma.CredentialUncheckedCreateWithoutUserInput>;
};
export type CredentialUpdateWithWhereUniqueWithoutUserInput = {
    where: Prisma.CredentialWhereUniqueInput;
    data: Prisma.XOR<Prisma.CredentialUpdateWithoutUserInput, Prisma.CredentialUncheckedUpdateWithoutUserInput>;
};
export type CredentialUpdateManyWithWhereWithoutUserInput = {
    where: Prisma.CredentialScalarWhereInput;
    data: Prisma.XOR<Prisma.CredentialUpdateManyMutationInput, Prisma.CredentialUncheckedUpdateManyWithoutUserInput>;
};
export type CredentialScalarWhereInput = {
    AND?: Prisma.CredentialScalarWhereInput | Prisma.CredentialScalarWhereInput[];
    OR?: Prisma.CredentialScalarWhereInput[];
    NOT?: Prisma.CredentialScalarWhereInput | Prisma.CredentialScalarWhereInput[];
    id?: Prisma.StringFilter<"Credential"> | string;
    userId?: Prisma.StringFilter<"Credential"> | string;
    projectId?: Prisma.StringFilter<"Credential"> | string;
    name?: Prisma.StringFilter<"Credential"> | string;
    type?: Prisma.StringFilter<"Credential"> | string;
    dataEncrypted?: Prisma.StringFilter<"Credential"> | string;
    secretProviderId?: Prisma.StringNullableFilter<"Credential"> | string | null;
    externalRef?: Prisma.StringNullableFilter<"Credential"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Credential"> | Date | string;
};
export type CredentialCreateWithoutProjectInput = {
    id?: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    externalRef?: string | null;
    createdAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutCredentialsInput;
    secretProvider?: Prisma.SecretProviderCreateNestedOneWithoutCredentialsInput;
};
export type CredentialUncheckedCreateWithoutProjectInput = {
    id?: string;
    userId: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    secretProviderId?: string | null;
    externalRef?: string | null;
    createdAt?: Date | string;
};
export type CredentialCreateOrConnectWithoutProjectInput = {
    where: Prisma.CredentialWhereUniqueInput;
    create: Prisma.XOR<Prisma.CredentialCreateWithoutProjectInput, Prisma.CredentialUncheckedCreateWithoutProjectInput>;
};
export type CredentialCreateManyProjectInputEnvelope = {
    data: Prisma.CredentialCreateManyProjectInput | Prisma.CredentialCreateManyProjectInput[];
    skipDuplicates?: boolean;
};
export type CredentialUpsertWithWhereUniqueWithoutProjectInput = {
    where: Prisma.CredentialWhereUniqueInput;
    update: Prisma.XOR<Prisma.CredentialUpdateWithoutProjectInput, Prisma.CredentialUncheckedUpdateWithoutProjectInput>;
    create: Prisma.XOR<Prisma.CredentialCreateWithoutProjectInput, Prisma.CredentialUncheckedCreateWithoutProjectInput>;
};
export type CredentialUpdateWithWhereUniqueWithoutProjectInput = {
    where: Prisma.CredentialWhereUniqueInput;
    data: Prisma.XOR<Prisma.CredentialUpdateWithoutProjectInput, Prisma.CredentialUncheckedUpdateWithoutProjectInput>;
};
export type CredentialUpdateManyWithWhereWithoutProjectInput = {
    where: Prisma.CredentialScalarWhereInput;
    data: Prisma.XOR<Prisma.CredentialUpdateManyMutationInput, Prisma.CredentialUncheckedUpdateManyWithoutProjectInput>;
};
export type CredentialCreateWithoutSecretProviderInput = {
    id?: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    externalRef?: string | null;
    createdAt?: Date | string;
    user: Prisma.UserCreateNestedOneWithoutCredentialsInput;
    project: Prisma.ProjectCreateNestedOneWithoutCredentialsInput;
};
export type CredentialUncheckedCreateWithoutSecretProviderInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    externalRef?: string | null;
    createdAt?: Date | string;
};
export type CredentialCreateOrConnectWithoutSecretProviderInput = {
    where: Prisma.CredentialWhereUniqueInput;
    create: Prisma.XOR<Prisma.CredentialCreateWithoutSecretProviderInput, Prisma.CredentialUncheckedCreateWithoutSecretProviderInput>;
};
export type CredentialCreateManySecretProviderInputEnvelope = {
    data: Prisma.CredentialCreateManySecretProviderInput | Prisma.CredentialCreateManySecretProviderInput[];
    skipDuplicates?: boolean;
};
export type CredentialUpsertWithWhereUniqueWithoutSecretProviderInput = {
    where: Prisma.CredentialWhereUniqueInput;
    update: Prisma.XOR<Prisma.CredentialUpdateWithoutSecretProviderInput, Prisma.CredentialUncheckedUpdateWithoutSecretProviderInput>;
    create: Prisma.XOR<Prisma.CredentialCreateWithoutSecretProviderInput, Prisma.CredentialUncheckedCreateWithoutSecretProviderInput>;
};
export type CredentialUpdateWithWhereUniqueWithoutSecretProviderInput = {
    where: Prisma.CredentialWhereUniqueInput;
    data: Prisma.XOR<Prisma.CredentialUpdateWithoutSecretProviderInput, Prisma.CredentialUncheckedUpdateWithoutSecretProviderInput>;
};
export type CredentialUpdateManyWithWhereWithoutSecretProviderInput = {
    where: Prisma.CredentialScalarWhereInput;
    data: Prisma.XOR<Prisma.CredentialUpdateManyMutationInput, Prisma.CredentialUncheckedUpdateManyWithoutSecretProviderInput>;
};
export type CredentialCreateManyUserInput = {
    id?: string;
    projectId: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    secretProviderId?: string | null;
    externalRef?: string | null;
    createdAt?: Date | string;
};
export type CredentialUpdateWithoutUserInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    project?: Prisma.ProjectUpdateOneRequiredWithoutCredentialsNestedInput;
    secretProvider?: Prisma.SecretProviderUpdateOneWithoutCredentialsNestedInput;
};
export type CredentialUncheckedUpdateWithoutUserInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    secretProviderId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CredentialUncheckedUpdateManyWithoutUserInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    secretProviderId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CredentialCreateManyProjectInput = {
    id?: string;
    userId: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    secretProviderId?: string | null;
    externalRef?: string | null;
    createdAt?: Date | string;
};
export type CredentialUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutCredentialsNestedInput;
    secretProvider?: Prisma.SecretProviderUpdateOneWithoutCredentialsNestedInput;
};
export type CredentialUncheckedUpdateWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    secretProviderId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CredentialUncheckedUpdateManyWithoutProjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    secretProviderId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CredentialCreateManySecretProviderInput = {
    id?: string;
    userId: string;
    projectId: string;
    name: string;
    type: string;
    dataEncrypted?: string;
    externalRef?: string | null;
    createdAt?: Date | string;
};
export type CredentialUpdateWithoutSecretProviderInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    user?: Prisma.UserUpdateOneRequiredWithoutCredentialsNestedInput;
    project?: Prisma.ProjectUpdateOneRequiredWithoutCredentialsNestedInput;
};
export type CredentialUncheckedUpdateWithoutSecretProviderInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CredentialUncheckedUpdateManyWithoutSecretProviderInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    projectId?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    dataEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    externalRef?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CredentialSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    type?: boolean;
    dataEncrypted?: boolean;
    secretProviderId?: boolean;
    externalRef?: boolean;
    createdAt?: boolean;
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    secretProvider?: boolean | Prisma.Credential$secretProviderArgs<ExtArgs>;
}, ExtArgs["result"]["credential"]>;
export type CredentialSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    type?: boolean;
    dataEncrypted?: boolean;
    secretProviderId?: boolean;
    externalRef?: boolean;
    createdAt?: boolean;
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    secretProvider?: boolean | Prisma.Credential$secretProviderArgs<ExtArgs>;
}, ExtArgs["result"]["credential"]>;
export type CredentialSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    type?: boolean;
    dataEncrypted?: boolean;
    secretProviderId?: boolean;
    externalRef?: boolean;
    createdAt?: boolean;
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    secretProvider?: boolean | Prisma.Credential$secretProviderArgs<ExtArgs>;
}, ExtArgs["result"]["credential"]>;
export type CredentialSelectScalar = {
    id?: boolean;
    userId?: boolean;
    projectId?: boolean;
    name?: boolean;
    type?: boolean;
    dataEncrypted?: boolean;
    secretProviderId?: boolean;
    externalRef?: boolean;
    createdAt?: boolean;
};
export type CredentialOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "userId" | "projectId" | "name" | "type" | "dataEncrypted" | "secretProviderId" | "externalRef" | "createdAt", ExtArgs["result"]["credential"]>;
export type CredentialInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    secretProvider?: boolean | Prisma.Credential$secretProviderArgs<ExtArgs>;
};
export type CredentialIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    secretProvider?: boolean | Prisma.Credential$secretProviderArgs<ExtArgs>;
};
export type CredentialIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    user?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    project?: boolean | Prisma.ProjectDefaultArgs<ExtArgs>;
    secretProvider?: boolean | Prisma.Credential$secretProviderArgs<ExtArgs>;
};
export type $CredentialPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Credential";
    objects: {
        user: Prisma.$UserPayload<ExtArgs>;
        project: Prisma.$ProjectPayload<ExtArgs>;
        secretProvider: Prisma.$SecretProviderPayload<ExtArgs> | null;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        userId: string;
        projectId: string;
        name: string;
        type: string;
        /**
         * Local AES blob; empty when fully external
         */
        dataEncrypted: string;
        /**
         * Optional external secret store
         */
        secretProviderId: string | null;
        /**
         * Path/ARN/name in external store
         */
        externalRef: string | null;
        createdAt: Date;
    }, ExtArgs["result"]["credential"]>;
    composites: {};
};
export type CredentialGetPayload<S extends boolean | null | undefined | CredentialDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$CredentialPayload, S>;
export type CredentialCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<CredentialFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: CredentialCountAggregateInputType | true;
};
export interface CredentialDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Credential'];
        meta: {
            name: 'Credential';
        };
    };
    /**
     * Find zero or one Credential that matches the filter.
     * @param {CredentialFindUniqueArgs} args - Arguments to find a Credential
     * @example
     * // Get one Credential
     * const credential = await prisma.credential.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CredentialFindUniqueArgs>(args: Prisma.SelectSubset<T, CredentialFindUniqueArgs<ExtArgs>>): Prisma.Prisma__CredentialClient<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Credential that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CredentialFindUniqueOrThrowArgs} args - Arguments to find a Credential
     * @example
     * // Get one Credential
     * const credential = await prisma.credential.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CredentialFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, CredentialFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__CredentialClient<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Credential that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CredentialFindFirstArgs} args - Arguments to find a Credential
     * @example
     * // Get one Credential
     * const credential = await prisma.credential.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CredentialFindFirstArgs>(args?: Prisma.SelectSubset<T, CredentialFindFirstArgs<ExtArgs>>): Prisma.Prisma__CredentialClient<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Credential that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CredentialFindFirstOrThrowArgs} args - Arguments to find a Credential
     * @example
     * // Get one Credential
     * const credential = await prisma.credential.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CredentialFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, CredentialFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__CredentialClient<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Credentials that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CredentialFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Credentials
     * const credentials = await prisma.credential.findMany()
     *
     * // Get first 10 Credentials
     * const credentials = await prisma.credential.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const credentialWithIdOnly = await prisma.credential.findMany({ select: { id: true } })
     *
     */
    findMany<T extends CredentialFindManyArgs>(args?: Prisma.SelectSubset<T, CredentialFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Credential.
     * @param {CredentialCreateArgs} args - Arguments to create a Credential.
     * @example
     * // Create one Credential
     * const Credential = await prisma.credential.create({
     *   data: {
     *     // ... data to create a Credential
     *   }
     * })
     *
     */
    create<T extends CredentialCreateArgs>(args: Prisma.SelectSubset<T, CredentialCreateArgs<ExtArgs>>): Prisma.Prisma__CredentialClient<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Credentials.
     * @param {CredentialCreateManyArgs} args - Arguments to create many Credentials.
     * @example
     * // Create many Credentials
     * const credential = await prisma.credential.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends CredentialCreateManyArgs>(args?: Prisma.SelectSubset<T, CredentialCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Credentials and returns the data saved in the database.
     * @param {CredentialCreateManyAndReturnArgs} args - Arguments to create many Credentials.
     * @example
     * // Create many Credentials
     * const credential = await prisma.credential.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Credentials and only return the `id`
     * const credentialWithIdOnly = await prisma.credential.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends CredentialCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, CredentialCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Credential.
     * @param {CredentialDeleteArgs} args - Arguments to delete one Credential.
     * @example
     * // Delete one Credential
     * const Credential = await prisma.credential.delete({
     *   where: {
     *     // ... filter to delete one Credential
     *   }
     * })
     *
     */
    delete<T extends CredentialDeleteArgs>(args: Prisma.SelectSubset<T, CredentialDeleteArgs<ExtArgs>>): Prisma.Prisma__CredentialClient<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Credential.
     * @param {CredentialUpdateArgs} args - Arguments to update one Credential.
     * @example
     * // Update one Credential
     * const credential = await prisma.credential.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends CredentialUpdateArgs>(args: Prisma.SelectSubset<T, CredentialUpdateArgs<ExtArgs>>): Prisma.Prisma__CredentialClient<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Credentials.
     * @param {CredentialDeleteManyArgs} args - Arguments to filter Credentials to delete.
     * @example
     * // Delete a few Credentials
     * const { count } = await prisma.credential.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends CredentialDeleteManyArgs>(args?: Prisma.SelectSubset<T, CredentialDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Credentials.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CredentialUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Credentials
     * const credential = await prisma.credential.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends CredentialUpdateManyArgs>(args: Prisma.SelectSubset<T, CredentialUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Credentials and returns the data updated in the database.
     * @param {CredentialUpdateManyAndReturnArgs} args - Arguments to update many Credentials.
     * @example
     * // Update many Credentials
     * const credential = await prisma.credential.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Credentials and only return the `id`
     * const credentialWithIdOnly = await prisma.credential.updateManyAndReturn({
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
    updateManyAndReturn<T extends CredentialUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, CredentialUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Credential.
     * @param {CredentialUpsertArgs} args - Arguments to update or create a Credential.
     * @example
     * // Update or create a Credential
     * const credential = await prisma.credential.upsert({
     *   create: {
     *     // ... data to create a Credential
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Credential we want to update
     *   }
     * })
     */
    upsert<T extends CredentialUpsertArgs>(args: Prisma.SelectSubset<T, CredentialUpsertArgs<ExtArgs>>): Prisma.Prisma__CredentialClient<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Credentials.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CredentialCountArgs} args - Arguments to filter Credentials to count.
     * @example
     * // Count the number of Credentials
     * const count = await prisma.credential.count({
     *   where: {
     *     // ... the filter for the Credentials we want to count
     *   }
     * })
    **/
    count<T extends CredentialCountArgs>(args?: Prisma.Subset<T, CredentialCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], CredentialCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Credential.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CredentialAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends CredentialAggregateArgs>(args: Prisma.Subset<T, CredentialAggregateArgs>): Prisma.PrismaPromise<GetCredentialAggregateType<T>>;
    /**
     * Group by Credential.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CredentialGroupByArgs} args - Group by arguments.
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
    groupBy<T extends CredentialGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: CredentialGroupByArgs['orderBy'];
    } : {
        orderBy?: CredentialGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, CredentialGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCredentialGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Credential model
     */
    readonly fields: CredentialFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Credential.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__CredentialClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    user<T extends Prisma.UserDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.UserDefaultArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    project<T extends Prisma.ProjectDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ProjectDefaultArgs<ExtArgs>>): Prisma.Prisma__ProjectClient<runtime.Types.Result.GetResult<Prisma.$ProjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    secretProvider<T extends Prisma.Credential$secretProviderArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Credential$secretProviderArgs<ExtArgs>>): Prisma.Prisma__SecretProviderClient<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
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
 * Fields of the Credential model
 */
export interface CredentialFieldRefs {
    readonly id: Prisma.FieldRef<"Credential", 'String'>;
    readonly userId: Prisma.FieldRef<"Credential", 'String'>;
    readonly projectId: Prisma.FieldRef<"Credential", 'String'>;
    readonly name: Prisma.FieldRef<"Credential", 'String'>;
    readonly type: Prisma.FieldRef<"Credential", 'String'>;
    readonly dataEncrypted: Prisma.FieldRef<"Credential", 'String'>;
    readonly secretProviderId: Prisma.FieldRef<"Credential", 'String'>;
    readonly externalRef: Prisma.FieldRef<"Credential", 'String'>;
    readonly createdAt: Prisma.FieldRef<"Credential", 'DateTime'>;
}
/**
 * Credential findUnique
 */
export type CredentialFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Credential to fetch.
     */
    where: Prisma.CredentialWhereUniqueInput;
};
/**
 * Credential findUniqueOrThrow
 */
export type CredentialFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Credential to fetch.
     */
    where: Prisma.CredentialWhereUniqueInput;
};
/**
 * Credential findFirst
 */
export type CredentialFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Credential to fetch.
     */
    where?: Prisma.CredentialWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Credentials to fetch.
     */
    orderBy?: Prisma.CredentialOrderByWithRelationInput | Prisma.CredentialOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Credentials.
     */
    cursor?: Prisma.CredentialWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Credentials from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Credentials.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Credentials.
     */
    distinct?: Prisma.CredentialScalarFieldEnum | Prisma.CredentialScalarFieldEnum[];
};
/**
 * Credential findFirstOrThrow
 */
export type CredentialFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Credential to fetch.
     */
    where?: Prisma.CredentialWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Credentials to fetch.
     */
    orderBy?: Prisma.CredentialOrderByWithRelationInput | Prisma.CredentialOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Credentials.
     */
    cursor?: Prisma.CredentialWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Credentials from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Credentials.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Credentials.
     */
    distinct?: Prisma.CredentialScalarFieldEnum | Prisma.CredentialScalarFieldEnum[];
};
/**
 * Credential findMany
 */
export type CredentialFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Credentials to fetch.
     */
    where?: Prisma.CredentialWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Credentials to fetch.
     */
    orderBy?: Prisma.CredentialOrderByWithRelationInput | Prisma.CredentialOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Credentials.
     */
    cursor?: Prisma.CredentialWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Credentials from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Credentials.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Credentials.
     */
    distinct?: Prisma.CredentialScalarFieldEnum | Prisma.CredentialScalarFieldEnum[];
};
/**
 * Credential create
 */
export type CredentialCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a Credential.
     */
    data: Prisma.XOR<Prisma.CredentialCreateInput, Prisma.CredentialUncheckedCreateInput>;
};
/**
 * Credential createMany
 */
export type CredentialCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Credentials.
     */
    data: Prisma.CredentialCreateManyInput | Prisma.CredentialCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Credential createManyAndReturn
 */
export type CredentialCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Credential
     */
    select?: Prisma.CredentialSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Credential
     */
    omit?: Prisma.CredentialOmit<ExtArgs> | null;
    /**
     * The data used to create many Credentials.
     */
    data: Prisma.CredentialCreateManyInput | Prisma.CredentialCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CredentialIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * Credential update
 */
export type CredentialUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a Credential.
     */
    data: Prisma.XOR<Prisma.CredentialUpdateInput, Prisma.CredentialUncheckedUpdateInput>;
    /**
     * Choose, which Credential to update.
     */
    where: Prisma.CredentialWhereUniqueInput;
};
/**
 * Credential updateMany
 */
export type CredentialUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Credentials.
     */
    data: Prisma.XOR<Prisma.CredentialUpdateManyMutationInput, Prisma.CredentialUncheckedUpdateManyInput>;
    /**
     * Filter which Credentials to update
     */
    where?: Prisma.CredentialWhereInput;
    /**
     * Limit how many Credentials to update.
     */
    limit?: number;
};
/**
 * Credential updateManyAndReturn
 */
export type CredentialUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Credential
     */
    select?: Prisma.CredentialSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Credential
     */
    omit?: Prisma.CredentialOmit<ExtArgs> | null;
    /**
     * The data used to update Credentials.
     */
    data: Prisma.XOR<Prisma.CredentialUpdateManyMutationInput, Prisma.CredentialUncheckedUpdateManyInput>;
    /**
     * Filter which Credentials to update
     */
    where?: Prisma.CredentialWhereInput;
    /**
     * Limit how many Credentials to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CredentialIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * Credential upsert
 */
export type CredentialUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the Credential to update in case it exists.
     */
    where: Prisma.CredentialWhereUniqueInput;
    /**
     * In case the Credential found by the `where` argument doesn't exist, create a new Credential with this data.
     */
    create: Prisma.XOR<Prisma.CredentialCreateInput, Prisma.CredentialUncheckedCreateInput>;
    /**
     * In case the Credential was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.CredentialUpdateInput, Prisma.CredentialUncheckedUpdateInput>;
};
/**
 * Credential delete
 */
export type CredentialDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which Credential to delete.
     */
    where: Prisma.CredentialWhereUniqueInput;
};
/**
 * Credential deleteMany
 */
export type CredentialDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Credentials to delete
     */
    where?: Prisma.CredentialWhereInput;
    /**
     * Limit how many Credentials to delete.
     */
    limit?: number;
};
/**
 * Credential.secretProvider
 */
export type Credential$secretProviderArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SecretProvider
     */
    select?: Prisma.SecretProviderSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SecretProvider
     */
    omit?: Prisma.SecretProviderOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SecretProviderInclude<ExtArgs> | null;
    where?: Prisma.SecretProviderWhereInput;
};
/**
 * Credential without action
 */
export type CredentialDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
