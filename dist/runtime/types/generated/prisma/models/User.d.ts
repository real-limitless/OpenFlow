import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model User
 *
 */
export type UserModel = runtime.Types.Result.DefaultSelection<Prisma.$UserPayload>;
export type AggregateUser = {
    _count: UserCountAggregateOutputType | null;
    _min: UserMinAggregateOutputType | null;
    _max: UserMaxAggregateOutputType | null;
};
export type UserMinAggregateOutputType = {
    id: string | null;
    email: string | null;
    passwordHash: string | null;
    role: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type UserMaxAggregateOutputType = {
    id: string | null;
    email: string | null;
    passwordHash: string | null;
    role: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type UserCountAggregateOutputType = {
    id: number;
    email: number;
    passwordHash: number;
    role: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type UserMinAggregateInputType = {
    id?: true;
    email?: true;
    passwordHash?: true;
    role?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type UserMaxAggregateInputType = {
    id?: true;
    email?: true;
    passwordHash?: true;
    role?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type UserCountAggregateInputType = {
    id?: true;
    email?: true;
    passwordHash?: true;
    role?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type UserAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: Prisma.UserWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Users to fetch.
     */
    orderBy?: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.UserWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Users from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Users.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType;
};
export type GetUserAggregateType<T extends UserAggregateArgs> = {
    [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateUser[P]> : Prisma.GetScalarType<T[P], AggregateUser[P]>;
};
export type UserGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithAggregationInput | Prisma.UserOrderByWithAggregationInput[];
    by: Prisma.UserScalarFieldEnum[] | Prisma.UserScalarFieldEnum;
    having?: Prisma.UserScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: UserCountAggregateInputType | true;
    _min?: UserMinAggregateInputType;
    _max?: UserMaxAggregateInputType;
};
export type UserGroupByOutputType = {
    id: string;
    email: string;
    passwordHash: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    _count: UserCountAggregateOutputType | null;
    _min: UserMinAggregateOutputType | null;
    _max: UserMaxAggregateOutputType | null;
};
export type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<UserGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], UserGroupByOutputType[P]> : Prisma.GetScalarType<T[P], UserGroupByOutputType[P]>;
}>>;
export type UserWhereInput = {
    AND?: Prisma.UserWhereInput | Prisma.UserWhereInput[];
    OR?: Prisma.UserWhereInput[];
    NOT?: Prisma.UserWhereInput | Prisma.UserWhereInput[];
    id?: Prisma.StringFilter<"User"> | string;
    email?: Prisma.StringFilter<"User"> | string;
    passwordHash?: Prisma.StringFilter<"User"> | string;
    role?: Prisma.StringFilter<"User"> | string;
    createdAt?: Prisma.DateTimeFilter<"User"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"User"> | Date | string;
    workflows?: Prisma.WorkflowListRelationFilter;
    credentials?: Prisma.CredentialListRelationFilter;
    apiKeys?: Prisma.ApiKeyListRelationFilter;
    dataTables?: Prisma.DataTableListRelationFilter;
    sessions?: Prisma.SessionListRelationFilter;
    projectMembers?: Prisma.ProjectMemberListRelationFilter;
    sharesGranted?: Prisma.ShareListRelationFilter;
    sharesCreated?: Prisma.ShareListRelationFilter;
};
export type UserOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    email?: Prisma.SortOrder;
    passwordHash?: Prisma.SortOrder;
    role?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    workflows?: Prisma.WorkflowOrderByRelationAggregateInput;
    credentials?: Prisma.CredentialOrderByRelationAggregateInput;
    apiKeys?: Prisma.ApiKeyOrderByRelationAggregateInput;
    dataTables?: Prisma.DataTableOrderByRelationAggregateInput;
    sessions?: Prisma.SessionOrderByRelationAggregateInput;
    projectMembers?: Prisma.ProjectMemberOrderByRelationAggregateInput;
    sharesGranted?: Prisma.ShareOrderByRelationAggregateInput;
    sharesCreated?: Prisma.ShareOrderByRelationAggregateInput;
};
export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    email?: string;
    AND?: Prisma.UserWhereInput | Prisma.UserWhereInput[];
    OR?: Prisma.UserWhereInput[];
    NOT?: Prisma.UserWhereInput | Prisma.UserWhereInput[];
    passwordHash?: Prisma.StringFilter<"User"> | string;
    role?: Prisma.StringFilter<"User"> | string;
    createdAt?: Prisma.DateTimeFilter<"User"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"User"> | Date | string;
    workflows?: Prisma.WorkflowListRelationFilter;
    credentials?: Prisma.CredentialListRelationFilter;
    apiKeys?: Prisma.ApiKeyListRelationFilter;
    dataTables?: Prisma.DataTableListRelationFilter;
    sessions?: Prisma.SessionListRelationFilter;
    projectMembers?: Prisma.ProjectMemberListRelationFilter;
    sharesGranted?: Prisma.ShareListRelationFilter;
    sharesCreated?: Prisma.ShareListRelationFilter;
}, "id" | "email">;
export type UserOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    email?: Prisma.SortOrder;
    passwordHash?: Prisma.SortOrder;
    role?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.UserCountOrderByAggregateInput;
    _max?: Prisma.UserMaxOrderByAggregateInput;
    _min?: Prisma.UserMinOrderByAggregateInput;
};
export type UserScalarWhereWithAggregatesInput = {
    AND?: Prisma.UserScalarWhereWithAggregatesInput | Prisma.UserScalarWhereWithAggregatesInput[];
    OR?: Prisma.UserScalarWhereWithAggregatesInput[];
    NOT?: Prisma.UserScalarWhereWithAggregatesInput | Prisma.UserScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"User"> | string;
    email?: Prisma.StringWithAggregatesFilter<"User"> | string;
    passwordHash?: Prisma.StringWithAggregatesFilter<"User"> | string;
    role?: Prisma.StringWithAggregatesFilter<"User"> | string;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"User"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"User"> | Date | string;
};
export type UserCreateInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareCreateNestedManyWithoutCreatedByInput;
};
export type UserUncheckedCreateInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyUncheckedCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionUncheckedCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareUncheckedCreateNestedManyWithoutCreatedByInput;
};
export type UserUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUpdateManyWithoutCreatedByNestedInput;
};
export type UserUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUncheckedUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUncheckedUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUncheckedUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUncheckedUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUncheckedUpdateManyWithoutCreatedByNestedInput;
};
export type UserCreateManyInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type UserUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type UserUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type UserCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    email?: Prisma.SortOrder;
    passwordHash?: Prisma.SortOrder;
    role?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type UserMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    email?: Prisma.SortOrder;
    passwordHash?: Prisma.SortOrder;
    role?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type UserMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    email?: Prisma.SortOrder;
    passwordHash?: Prisma.SortOrder;
    role?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type UserNullableScalarRelationFilter = {
    is?: Prisma.UserWhereInput | null;
    isNot?: Prisma.UserWhereInput | null;
};
export type UserScalarRelationFilter = {
    is?: Prisma.UserWhereInput;
    isNot?: Prisma.UserWhereInput;
};
export type StringFieldUpdateOperationsInput = {
    set?: string;
};
export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string;
};
export type UserCreateNestedOneWithoutSharesGrantedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutSharesGrantedInput, Prisma.UserUncheckedCreateWithoutSharesGrantedInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutSharesGrantedInput;
    connect?: Prisma.UserWhereUniqueInput;
};
export type UserCreateNestedOneWithoutSharesCreatedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutSharesCreatedInput, Prisma.UserUncheckedCreateWithoutSharesCreatedInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutSharesCreatedInput;
    connect?: Prisma.UserWhereUniqueInput;
};
export type UserUpdateOneWithoutSharesGrantedNestedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutSharesGrantedInput, Prisma.UserUncheckedCreateWithoutSharesGrantedInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutSharesGrantedInput;
    upsert?: Prisma.UserUpsertWithoutSharesGrantedInput;
    disconnect?: Prisma.UserWhereInput | boolean;
    delete?: Prisma.UserWhereInput | boolean;
    connect?: Prisma.UserWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.UserUpdateToOneWithWhereWithoutSharesGrantedInput, Prisma.UserUpdateWithoutSharesGrantedInput>, Prisma.UserUncheckedUpdateWithoutSharesGrantedInput>;
};
export type UserUpdateOneRequiredWithoutSharesCreatedNestedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutSharesCreatedInput, Prisma.UserUncheckedCreateWithoutSharesCreatedInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutSharesCreatedInput;
    upsert?: Prisma.UserUpsertWithoutSharesCreatedInput;
    connect?: Prisma.UserWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.UserUpdateToOneWithWhereWithoutSharesCreatedInput, Prisma.UserUpdateWithoutSharesCreatedInput>, Prisma.UserUncheckedUpdateWithoutSharesCreatedInput>;
};
export type UserCreateNestedOneWithoutProjectMembersInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutProjectMembersInput, Prisma.UserUncheckedCreateWithoutProjectMembersInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutProjectMembersInput;
    connect?: Prisma.UserWhereUniqueInput;
};
export type UserUpdateOneRequiredWithoutProjectMembersNestedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutProjectMembersInput, Prisma.UserUncheckedCreateWithoutProjectMembersInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutProjectMembersInput;
    upsert?: Prisma.UserUpsertWithoutProjectMembersInput;
    connect?: Prisma.UserWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.UserUpdateToOneWithWhereWithoutProjectMembersInput, Prisma.UserUpdateWithoutProjectMembersInput>, Prisma.UserUncheckedUpdateWithoutProjectMembersInput>;
};
export type UserCreateNestedOneWithoutSessionsInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutSessionsInput, Prisma.UserUncheckedCreateWithoutSessionsInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutSessionsInput;
    connect?: Prisma.UserWhereUniqueInput;
};
export type UserUpdateOneRequiredWithoutSessionsNestedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutSessionsInput, Prisma.UserUncheckedCreateWithoutSessionsInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutSessionsInput;
    upsert?: Prisma.UserUpsertWithoutSessionsInput;
    connect?: Prisma.UserWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.UserUpdateToOneWithWhereWithoutSessionsInput, Prisma.UserUpdateWithoutSessionsInput>, Prisma.UserUncheckedUpdateWithoutSessionsInput>;
};
export type UserCreateNestedOneWithoutWorkflowsInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutWorkflowsInput, Prisma.UserUncheckedCreateWithoutWorkflowsInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutWorkflowsInput;
    connect?: Prisma.UserWhereUniqueInput;
};
export type UserUpdateOneRequiredWithoutWorkflowsNestedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutWorkflowsInput, Prisma.UserUncheckedCreateWithoutWorkflowsInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutWorkflowsInput;
    upsert?: Prisma.UserUpsertWithoutWorkflowsInput;
    connect?: Prisma.UserWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.UserUpdateToOneWithWhereWithoutWorkflowsInput, Prisma.UserUpdateWithoutWorkflowsInput>, Prisma.UserUncheckedUpdateWithoutWorkflowsInput>;
};
export type UserCreateNestedOneWithoutCredentialsInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutCredentialsInput, Prisma.UserUncheckedCreateWithoutCredentialsInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutCredentialsInput;
    connect?: Prisma.UserWhereUniqueInput;
};
export type UserUpdateOneRequiredWithoutCredentialsNestedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutCredentialsInput, Prisma.UserUncheckedCreateWithoutCredentialsInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutCredentialsInput;
    upsert?: Prisma.UserUpsertWithoutCredentialsInput;
    connect?: Prisma.UserWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.UserUpdateToOneWithWhereWithoutCredentialsInput, Prisma.UserUpdateWithoutCredentialsInput>, Prisma.UserUncheckedUpdateWithoutCredentialsInput>;
};
export type UserCreateNestedOneWithoutApiKeysInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutApiKeysInput, Prisma.UserUncheckedCreateWithoutApiKeysInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutApiKeysInput;
    connect?: Prisma.UserWhereUniqueInput;
};
export type UserUpdateOneRequiredWithoutApiKeysNestedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutApiKeysInput, Prisma.UserUncheckedCreateWithoutApiKeysInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutApiKeysInput;
    upsert?: Prisma.UserUpsertWithoutApiKeysInput;
    connect?: Prisma.UserWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.UserUpdateToOneWithWhereWithoutApiKeysInput, Prisma.UserUpdateWithoutApiKeysInput>, Prisma.UserUncheckedUpdateWithoutApiKeysInput>;
};
export type UserCreateNestedOneWithoutDataTablesInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutDataTablesInput, Prisma.UserUncheckedCreateWithoutDataTablesInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutDataTablesInput;
    connect?: Prisma.UserWhereUniqueInput;
};
export type UserUpdateOneRequiredWithoutDataTablesNestedInput = {
    create?: Prisma.XOR<Prisma.UserCreateWithoutDataTablesInput, Prisma.UserUncheckedCreateWithoutDataTablesInput>;
    connectOrCreate?: Prisma.UserCreateOrConnectWithoutDataTablesInput;
    upsert?: Prisma.UserUpsertWithoutDataTablesInput;
    connect?: Prisma.UserWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.UserUpdateToOneWithWhereWithoutDataTablesInput, Prisma.UserUpdateWithoutDataTablesInput>, Prisma.UserUncheckedUpdateWithoutDataTablesInput>;
};
export type UserCreateWithoutSharesGrantedInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberCreateNestedManyWithoutUserInput;
    sharesCreated?: Prisma.ShareCreateNestedManyWithoutCreatedByInput;
};
export type UserUncheckedCreateWithoutSharesGrantedInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyUncheckedCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionUncheckedCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutUserInput;
    sharesCreated?: Prisma.ShareUncheckedCreateNestedManyWithoutCreatedByInput;
};
export type UserCreateOrConnectWithoutSharesGrantedInput = {
    where: Prisma.UserWhereUniqueInput;
    create: Prisma.XOR<Prisma.UserCreateWithoutSharesGrantedInput, Prisma.UserUncheckedCreateWithoutSharesGrantedInput>;
};
export type UserCreateWithoutSharesCreatedInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareCreateNestedManyWithoutGranteeUserInput;
};
export type UserUncheckedCreateWithoutSharesCreatedInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyUncheckedCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionUncheckedCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeUserInput;
};
export type UserCreateOrConnectWithoutSharesCreatedInput = {
    where: Prisma.UserWhereUniqueInput;
    create: Prisma.XOR<Prisma.UserCreateWithoutSharesCreatedInput, Prisma.UserUncheckedCreateWithoutSharesCreatedInput>;
};
export type UserUpsertWithoutSharesGrantedInput = {
    update: Prisma.XOR<Prisma.UserUpdateWithoutSharesGrantedInput, Prisma.UserUncheckedUpdateWithoutSharesGrantedInput>;
    create: Prisma.XOR<Prisma.UserCreateWithoutSharesGrantedInput, Prisma.UserUncheckedCreateWithoutSharesGrantedInput>;
    where?: Prisma.UserWhereInput;
};
export type UserUpdateToOneWithWhereWithoutSharesGrantedInput = {
    where?: Prisma.UserWhereInput;
    data: Prisma.XOR<Prisma.UserUpdateWithoutSharesGrantedInput, Prisma.UserUncheckedUpdateWithoutSharesGrantedInput>;
};
export type UserUpdateWithoutSharesGrantedInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUpdateManyWithoutUserNestedInput;
    sharesCreated?: Prisma.ShareUpdateManyWithoutCreatedByNestedInput;
};
export type UserUncheckedUpdateWithoutSharesGrantedInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUncheckedUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUncheckedUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUncheckedUpdateManyWithoutUserNestedInput;
    sharesCreated?: Prisma.ShareUncheckedUpdateManyWithoutCreatedByNestedInput;
};
export type UserUpsertWithoutSharesCreatedInput = {
    update: Prisma.XOR<Prisma.UserUpdateWithoutSharesCreatedInput, Prisma.UserUncheckedUpdateWithoutSharesCreatedInput>;
    create: Prisma.XOR<Prisma.UserCreateWithoutSharesCreatedInput, Prisma.UserUncheckedCreateWithoutSharesCreatedInput>;
    where?: Prisma.UserWhereInput;
};
export type UserUpdateToOneWithWhereWithoutSharesCreatedInput = {
    where?: Prisma.UserWhereInput;
    data: Prisma.XOR<Prisma.UserUpdateWithoutSharesCreatedInput, Prisma.UserUncheckedUpdateWithoutSharesCreatedInput>;
};
export type UserUpdateWithoutSharesCreatedInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUpdateManyWithoutGranteeUserNestedInput;
};
export type UserUncheckedUpdateWithoutSharesCreatedInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUncheckedUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUncheckedUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUncheckedUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUncheckedUpdateManyWithoutGranteeUserNestedInput;
};
export type UserCreateWithoutProjectMembersInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareCreateNestedManyWithoutCreatedByInput;
};
export type UserUncheckedCreateWithoutProjectMembersInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyUncheckedCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionUncheckedCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareUncheckedCreateNestedManyWithoutCreatedByInput;
};
export type UserCreateOrConnectWithoutProjectMembersInput = {
    where: Prisma.UserWhereUniqueInput;
    create: Prisma.XOR<Prisma.UserCreateWithoutProjectMembersInput, Prisma.UserUncheckedCreateWithoutProjectMembersInput>;
};
export type UserUpsertWithoutProjectMembersInput = {
    update: Prisma.XOR<Prisma.UserUpdateWithoutProjectMembersInput, Prisma.UserUncheckedUpdateWithoutProjectMembersInput>;
    create: Prisma.XOR<Prisma.UserCreateWithoutProjectMembersInput, Prisma.UserUncheckedCreateWithoutProjectMembersInput>;
    where?: Prisma.UserWhereInput;
};
export type UserUpdateToOneWithWhereWithoutProjectMembersInput = {
    where?: Prisma.UserWhereInput;
    data: Prisma.XOR<Prisma.UserUpdateWithoutProjectMembersInput, Prisma.UserUncheckedUpdateWithoutProjectMembersInput>;
};
export type UserUpdateWithoutProjectMembersInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUpdateManyWithoutCreatedByNestedInput;
};
export type UserUncheckedUpdateWithoutProjectMembersInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUncheckedUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUncheckedUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUncheckedUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUncheckedUpdateManyWithoutCreatedByNestedInput;
};
export type UserCreateWithoutSessionsInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareCreateNestedManyWithoutCreatedByInput;
};
export type UserUncheckedCreateWithoutSessionsInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyUncheckedCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareUncheckedCreateNestedManyWithoutCreatedByInput;
};
export type UserCreateOrConnectWithoutSessionsInput = {
    where: Prisma.UserWhereUniqueInput;
    create: Prisma.XOR<Prisma.UserCreateWithoutSessionsInput, Prisma.UserUncheckedCreateWithoutSessionsInput>;
};
export type UserUpsertWithoutSessionsInput = {
    update: Prisma.XOR<Prisma.UserUpdateWithoutSessionsInput, Prisma.UserUncheckedUpdateWithoutSessionsInput>;
    create: Prisma.XOR<Prisma.UserCreateWithoutSessionsInput, Prisma.UserUncheckedCreateWithoutSessionsInput>;
    where?: Prisma.UserWhereInput;
};
export type UserUpdateToOneWithWhereWithoutSessionsInput = {
    where?: Prisma.UserWhereInput;
    data: Prisma.XOR<Prisma.UserUpdateWithoutSessionsInput, Prisma.UserUncheckedUpdateWithoutSessionsInput>;
};
export type UserUpdateWithoutSessionsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUpdateManyWithoutCreatedByNestedInput;
};
export type UserUncheckedUpdateWithoutSessionsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUncheckedUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUncheckedUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUncheckedUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUncheckedUpdateManyWithoutCreatedByNestedInput;
};
export type UserCreateWithoutWorkflowsInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    credentials?: Prisma.CredentialCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareCreateNestedManyWithoutCreatedByInput;
};
export type UserUncheckedCreateWithoutWorkflowsInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyUncheckedCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionUncheckedCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareUncheckedCreateNestedManyWithoutCreatedByInput;
};
export type UserCreateOrConnectWithoutWorkflowsInput = {
    where: Prisma.UserWhereUniqueInput;
    create: Prisma.XOR<Prisma.UserCreateWithoutWorkflowsInput, Prisma.UserUncheckedCreateWithoutWorkflowsInput>;
};
export type UserUpsertWithoutWorkflowsInput = {
    update: Prisma.XOR<Prisma.UserUpdateWithoutWorkflowsInput, Prisma.UserUncheckedUpdateWithoutWorkflowsInput>;
    create: Prisma.XOR<Prisma.UserCreateWithoutWorkflowsInput, Prisma.UserUncheckedCreateWithoutWorkflowsInput>;
    where?: Prisma.UserWhereInput;
};
export type UserUpdateToOneWithWhereWithoutWorkflowsInput = {
    where?: Prisma.UserWhereInput;
    data: Prisma.XOR<Prisma.UserUpdateWithoutWorkflowsInput, Prisma.UserUncheckedUpdateWithoutWorkflowsInput>;
};
export type UserUpdateWithoutWorkflowsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    credentials?: Prisma.CredentialUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUpdateManyWithoutCreatedByNestedInput;
};
export type UserUncheckedUpdateWithoutWorkflowsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUncheckedUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUncheckedUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUncheckedUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUncheckedUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUncheckedUpdateManyWithoutCreatedByNestedInput;
};
export type UserCreateWithoutCredentialsInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareCreateNestedManyWithoutCreatedByInput;
};
export type UserUncheckedCreateWithoutCredentialsInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyUncheckedCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionUncheckedCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareUncheckedCreateNestedManyWithoutCreatedByInput;
};
export type UserCreateOrConnectWithoutCredentialsInput = {
    where: Prisma.UserWhereUniqueInput;
    create: Prisma.XOR<Prisma.UserCreateWithoutCredentialsInput, Prisma.UserUncheckedCreateWithoutCredentialsInput>;
};
export type UserUpsertWithoutCredentialsInput = {
    update: Prisma.XOR<Prisma.UserUpdateWithoutCredentialsInput, Prisma.UserUncheckedUpdateWithoutCredentialsInput>;
    create: Prisma.XOR<Prisma.UserCreateWithoutCredentialsInput, Prisma.UserUncheckedCreateWithoutCredentialsInput>;
    where?: Prisma.UserWhereInput;
};
export type UserUpdateToOneWithWhereWithoutCredentialsInput = {
    where?: Prisma.UserWhereInput;
    data: Prisma.XOR<Prisma.UserUpdateWithoutCredentialsInput, Prisma.UserUncheckedUpdateWithoutCredentialsInput>;
};
export type UserUpdateWithoutCredentialsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUpdateManyWithoutCreatedByNestedInput;
};
export type UserUncheckedUpdateWithoutCredentialsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUncheckedUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUncheckedUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUncheckedUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUncheckedUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUncheckedUpdateManyWithoutCreatedByNestedInput;
};
export type UserCreateWithoutApiKeysInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareCreateNestedManyWithoutCreatedByInput;
};
export type UserUncheckedCreateWithoutApiKeysInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutUserInput;
    dataTables?: Prisma.DataTableUncheckedCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionUncheckedCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareUncheckedCreateNestedManyWithoutCreatedByInput;
};
export type UserCreateOrConnectWithoutApiKeysInput = {
    where: Prisma.UserWhereUniqueInput;
    create: Prisma.XOR<Prisma.UserCreateWithoutApiKeysInput, Prisma.UserUncheckedCreateWithoutApiKeysInput>;
};
export type UserUpsertWithoutApiKeysInput = {
    update: Prisma.XOR<Prisma.UserUpdateWithoutApiKeysInput, Prisma.UserUncheckedUpdateWithoutApiKeysInput>;
    create: Prisma.XOR<Prisma.UserCreateWithoutApiKeysInput, Prisma.UserUncheckedCreateWithoutApiKeysInput>;
    where?: Prisma.UserWhereInput;
};
export type UserUpdateToOneWithWhereWithoutApiKeysInput = {
    where?: Prisma.UserWhereInput;
    data: Prisma.XOR<Prisma.UserUpdateWithoutApiKeysInput, Prisma.UserUncheckedUpdateWithoutApiKeysInput>;
};
export type UserUpdateWithoutApiKeysInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUpdateManyWithoutCreatedByNestedInput;
};
export type UserUncheckedUpdateWithoutApiKeysInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutUserNestedInput;
    dataTables?: Prisma.DataTableUncheckedUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUncheckedUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUncheckedUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUncheckedUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUncheckedUpdateManyWithoutCreatedByNestedInput;
};
export type UserCreateWithoutDataTablesInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareCreateNestedManyWithoutCreatedByInput;
};
export type UserUncheckedCreateWithoutDataTablesInput = {
    id?: string;
    email: string;
    passwordHash: string;
    role?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    workflows?: Prisma.WorkflowUncheckedCreateNestedManyWithoutUserInput;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutUserInput;
    apiKeys?: Prisma.ApiKeyUncheckedCreateNestedManyWithoutUserInput;
    sessions?: Prisma.SessionUncheckedCreateNestedManyWithoutUserInput;
    projectMembers?: Prisma.ProjectMemberUncheckedCreateNestedManyWithoutUserInput;
    sharesGranted?: Prisma.ShareUncheckedCreateNestedManyWithoutGranteeUserInput;
    sharesCreated?: Prisma.ShareUncheckedCreateNestedManyWithoutCreatedByInput;
};
export type UserCreateOrConnectWithoutDataTablesInput = {
    where: Prisma.UserWhereUniqueInput;
    create: Prisma.XOR<Prisma.UserCreateWithoutDataTablesInput, Prisma.UserUncheckedCreateWithoutDataTablesInput>;
};
export type UserUpsertWithoutDataTablesInput = {
    update: Prisma.XOR<Prisma.UserUpdateWithoutDataTablesInput, Prisma.UserUncheckedUpdateWithoutDataTablesInput>;
    create: Prisma.XOR<Prisma.UserCreateWithoutDataTablesInput, Prisma.UserUncheckedCreateWithoutDataTablesInput>;
    where?: Prisma.UserWhereInput;
};
export type UserUpdateToOneWithWhereWithoutDataTablesInput = {
    where?: Prisma.UserWhereInput;
    data: Prisma.XOR<Prisma.UserUpdateWithoutDataTablesInput, Prisma.UserUncheckedUpdateWithoutDataTablesInput>;
};
export type UserUpdateWithoutDataTablesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUpdateManyWithoutCreatedByNestedInput;
};
export type UserUncheckedUpdateWithoutDataTablesInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    email?: Prisma.StringFieldUpdateOperationsInput | string;
    passwordHash?: Prisma.StringFieldUpdateOperationsInput | string;
    role?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    workflows?: Prisma.WorkflowUncheckedUpdateManyWithoutUserNestedInput;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutUserNestedInput;
    apiKeys?: Prisma.ApiKeyUncheckedUpdateManyWithoutUserNestedInput;
    sessions?: Prisma.SessionUncheckedUpdateManyWithoutUserNestedInput;
    projectMembers?: Prisma.ProjectMemberUncheckedUpdateManyWithoutUserNestedInput;
    sharesGranted?: Prisma.ShareUncheckedUpdateManyWithoutGranteeUserNestedInput;
    sharesCreated?: Prisma.ShareUncheckedUpdateManyWithoutCreatedByNestedInput;
};
/**
 * Count Type UserCountOutputType
 */
export type UserCountOutputType = {
    workflows: number;
    credentials: number;
    apiKeys: number;
    dataTables: number;
    sessions: number;
    projectMembers: number;
    sharesGranted: number;
    sharesCreated: number;
};
export type UserCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflows?: boolean | UserCountOutputTypeCountWorkflowsArgs;
    credentials?: boolean | UserCountOutputTypeCountCredentialsArgs;
    apiKeys?: boolean | UserCountOutputTypeCountApiKeysArgs;
    dataTables?: boolean | UserCountOutputTypeCountDataTablesArgs;
    sessions?: boolean | UserCountOutputTypeCountSessionsArgs;
    projectMembers?: boolean | UserCountOutputTypeCountProjectMembersArgs;
    sharesGranted?: boolean | UserCountOutputTypeCountSharesGrantedArgs;
    sharesCreated?: boolean | UserCountOutputTypeCountSharesCreatedArgs;
};
/**
 * UserCountOutputType without action
 */
export type UserCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserCountOutputType
     */
    select?: Prisma.UserCountOutputTypeSelect<ExtArgs> | null;
};
/**
 * UserCountOutputType without action
 */
export type UserCountOutputTypeCountWorkflowsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.WorkflowWhereInput;
};
/**
 * UserCountOutputType without action
 */
export type UserCountOutputTypeCountCredentialsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.CredentialWhereInput;
};
/**
 * UserCountOutputType without action
 */
export type UserCountOutputTypeCountApiKeysArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ApiKeyWhereInput;
};
/**
 * UserCountOutputType without action
 */
export type UserCountOutputTypeCountDataTablesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.DataTableWhereInput;
};
/**
 * UserCountOutputType without action
 */
export type UserCountOutputTypeCountSessionsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SessionWhereInput;
};
/**
 * UserCountOutputType without action
 */
export type UserCountOutputTypeCountProjectMembersArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ProjectMemberWhereInput;
};
/**
 * UserCountOutputType without action
 */
export type UserCountOutputTypeCountSharesGrantedArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ShareWhereInput;
};
/**
 * UserCountOutputType without action
 */
export type UserCountOutputTypeCountSharesCreatedArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ShareWhereInput;
};
export type UserSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    email?: boolean;
    passwordHash?: boolean;
    role?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    workflows?: boolean | Prisma.User$workflowsArgs<ExtArgs>;
    credentials?: boolean | Prisma.User$credentialsArgs<ExtArgs>;
    apiKeys?: boolean | Prisma.User$apiKeysArgs<ExtArgs>;
    dataTables?: boolean | Prisma.User$dataTablesArgs<ExtArgs>;
    sessions?: boolean | Prisma.User$sessionsArgs<ExtArgs>;
    projectMembers?: boolean | Prisma.User$projectMembersArgs<ExtArgs>;
    sharesGranted?: boolean | Prisma.User$sharesGrantedArgs<ExtArgs>;
    sharesCreated?: boolean | Prisma.User$sharesCreatedArgs<ExtArgs>;
    _count?: boolean | Prisma.UserCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["user"]>;
export type UserSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    email?: boolean;
    passwordHash?: boolean;
    role?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["user"]>;
export type UserSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    email?: boolean;
    passwordHash?: boolean;
    role?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["user"]>;
export type UserSelectScalar = {
    id?: boolean;
    email?: boolean;
    passwordHash?: boolean;
    role?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type UserOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "email" | "passwordHash" | "role" | "createdAt" | "updatedAt", ExtArgs["result"]["user"]>;
export type UserInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflows?: boolean | Prisma.User$workflowsArgs<ExtArgs>;
    credentials?: boolean | Prisma.User$credentialsArgs<ExtArgs>;
    apiKeys?: boolean | Prisma.User$apiKeysArgs<ExtArgs>;
    dataTables?: boolean | Prisma.User$dataTablesArgs<ExtArgs>;
    sessions?: boolean | Prisma.User$sessionsArgs<ExtArgs>;
    projectMembers?: boolean | Prisma.User$projectMembersArgs<ExtArgs>;
    sharesGranted?: boolean | Prisma.User$sharesGrantedArgs<ExtArgs>;
    sharesCreated?: boolean | Prisma.User$sharesCreatedArgs<ExtArgs>;
    _count?: boolean | Prisma.UserCountOutputTypeDefaultArgs<ExtArgs>;
};
export type UserIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type UserIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type $UserPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "User";
    objects: {
        workflows: Prisma.$WorkflowPayload<ExtArgs>[];
        credentials: Prisma.$CredentialPayload<ExtArgs>[];
        apiKeys: Prisma.$ApiKeyPayload<ExtArgs>[];
        dataTables: Prisma.$DataTablePayload<ExtArgs>[];
        sessions: Prisma.$SessionPayload<ExtArgs>[];
        projectMembers: Prisma.$ProjectMemberPayload<ExtArgs>[];
        sharesGranted: Prisma.$SharePayload<ExtArgs>[];
        sharesCreated: Prisma.$SharePayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        email: string;
        passwordHash: string;
        /**
         * Instance-level role: owner | admin | member (projects add finer RBAC in E1)
         */
        role: string;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["user"]>;
    composites: {};
};
export type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$UserPayload, S>;
export type UserCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<UserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: UserCountAggregateInputType | true;
};
export interface UserDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['User'];
        meta: {
            name: 'User';
        };
    };
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: Prisma.SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: Prisma.SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     *
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     *
     */
    findMany<T extends UserFindManyArgs>(args?: Prisma.SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     *
     */
    create<T extends UserCreateArgs>(args: Prisma.SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends UserCreateManyArgs>(args?: Prisma.SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Users and returns the data saved in the database.
     * @param {UserCreateManyAndReturnArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Users and only return the `id`
     * const userWithIdOnly = await prisma.user.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends UserCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, UserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     *
     */
    delete<T extends UserDeleteArgs>(args: Prisma.SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends UserUpdateArgs>(args: Prisma.SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: Prisma.SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends UserUpdateManyArgs>(args: Prisma.SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Users and returns the data updated in the database.
     * @param {UserUpdateManyAndReturnArgs} args - Arguments to update many Users.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Users and only return the `id`
     * const userWithIdOnly = await prisma.user.updateManyAndReturn({
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
    updateManyAndReturn<T extends UserUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, UserUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: Prisma.SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(args?: Prisma.Subset<T, UserCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], UserCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends UserAggregateArgs>(args: Prisma.Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>;
    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
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
    groupBy<T extends UserGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: UserGroupByArgs['orderBy'];
    } : {
        orderBy?: UserGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the User model
     */
    readonly fields: UserFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for User.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__UserClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    workflows<T extends Prisma.User$workflowsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.User$workflowsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    credentials<T extends Prisma.User$credentialsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.User$credentialsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    apiKeys<T extends Prisma.User$apiKeysArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.User$apiKeysArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ApiKeyPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    dataTables<T extends Prisma.User$dataTablesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.User$dataTablesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    sessions<T extends Prisma.User$sessionsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.User$sessionsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    projectMembers<T extends Prisma.User$projectMembersArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.User$projectMembersArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ProjectMemberPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    sharesGranted<T extends Prisma.User$sharesGrantedArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.User$sharesGrantedArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SharePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    sharesCreated<T extends Prisma.User$sharesCreatedArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.User$sharesCreatedArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SharePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
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
 * Fields of the User model
 */
export interface UserFieldRefs {
    readonly id: Prisma.FieldRef<"User", 'String'>;
    readonly email: Prisma.FieldRef<"User", 'String'>;
    readonly passwordHash: Prisma.FieldRef<"User", 'String'>;
    readonly role: Prisma.FieldRef<"User", 'String'>;
    readonly createdAt: Prisma.FieldRef<"User", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"User", 'DateTime'>;
}
/**
 * User findUnique
 */
export type UserFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
    /**
     * Filter, which User to fetch.
     */
    where: Prisma.UserWhereUniqueInput;
};
/**
 * User findUniqueOrThrow
 */
export type UserFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
    /**
     * Filter, which User to fetch.
     */
    where: Prisma.UserWhereUniqueInput;
};
/**
 * User findFirst
 */
export type UserFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
    /**
     * Filter, which User to fetch.
     */
    where?: Prisma.UserWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Users to fetch.
     */
    orderBy?: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Users.
     */
    cursor?: Prisma.UserWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Users from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Users.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Users.
     */
    distinct?: Prisma.UserScalarFieldEnum | Prisma.UserScalarFieldEnum[];
};
/**
 * User findFirstOrThrow
 */
export type UserFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
    /**
     * Filter, which User to fetch.
     */
    where?: Prisma.UserWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Users to fetch.
     */
    orderBy?: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Users.
     */
    cursor?: Prisma.UserWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Users from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Users.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Users.
     */
    distinct?: Prisma.UserScalarFieldEnum | Prisma.UserScalarFieldEnum[];
};
/**
 * User findMany
 */
export type UserFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
    /**
     * Filter, which Users to fetch.
     */
    where?: Prisma.UserWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Users to fetch.
     */
    orderBy?: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Users.
     */
    cursor?: Prisma.UserWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Users from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Users.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Users.
     */
    distinct?: Prisma.UserScalarFieldEnum | Prisma.UserScalarFieldEnum[];
};
/**
 * User create
 */
export type UserCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
    /**
     * The data needed to create a User.
     */
    data: Prisma.XOR<Prisma.UserCreateInput, Prisma.UserUncheckedCreateInput>;
};
/**
 * User createMany
 */
export type UserCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: Prisma.UserCreateManyInput | Prisma.UserCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * User createManyAndReturn
 */
export type UserCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * The data used to create many Users.
     */
    data: Prisma.UserCreateManyInput | Prisma.UserCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * User update
 */
export type UserUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
    /**
     * The data needed to update a User.
     */
    data: Prisma.XOR<Prisma.UserUpdateInput, Prisma.UserUncheckedUpdateInput>;
    /**
     * Choose, which User to update.
     */
    where: Prisma.UserWhereUniqueInput;
};
/**
 * User updateMany
 */
export type UserUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: Prisma.XOR<Prisma.UserUpdateManyMutationInput, Prisma.UserUncheckedUpdateManyInput>;
    /**
     * Filter which Users to update
     */
    where?: Prisma.UserWhereInput;
    /**
     * Limit how many Users to update.
     */
    limit?: number;
};
/**
 * User updateManyAndReturn
 */
export type UserUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * The data used to update Users.
     */
    data: Prisma.XOR<Prisma.UserUpdateManyMutationInput, Prisma.UserUncheckedUpdateManyInput>;
    /**
     * Filter which Users to update
     */
    where?: Prisma.UserWhereInput;
    /**
     * Limit how many Users to update.
     */
    limit?: number;
};
/**
 * User upsert
 */
export type UserUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: Prisma.UserWhereUniqueInput;
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: Prisma.XOR<Prisma.UserCreateInput, Prisma.UserUncheckedCreateInput>;
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.UserUpdateInput, Prisma.UserUncheckedUpdateInput>;
};
/**
 * User delete
 */
export type UserDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
    /**
     * Filter which User to delete.
     */
    where: Prisma.UserWhereUniqueInput;
};
/**
 * User deleteMany
 */
export type UserDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: Prisma.UserWhereInput;
    /**
     * Limit how many Users to delete.
     */
    limit?: number;
};
/**
 * User.workflows
 */
export type User$workflowsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
 * User.credentials
 */
export type User$credentialsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
 * User.apiKeys
 */
export type User$apiKeysArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ApiKey
     */
    select?: Prisma.ApiKeySelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ApiKey
     */
    omit?: Prisma.ApiKeyOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ApiKeyInclude<ExtArgs> | null;
    where?: Prisma.ApiKeyWhereInput;
    orderBy?: Prisma.ApiKeyOrderByWithRelationInput | Prisma.ApiKeyOrderByWithRelationInput[];
    cursor?: Prisma.ApiKeyWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ApiKeyScalarFieldEnum | Prisma.ApiKeyScalarFieldEnum[];
};
/**
 * User.dataTables
 */
export type User$dataTablesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
 * User.sessions
 */
export type User$sessionsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: Prisma.SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: Prisma.SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SessionInclude<ExtArgs> | null;
    where?: Prisma.SessionWhereInput;
    orderBy?: Prisma.SessionOrderByWithRelationInput | Prisma.SessionOrderByWithRelationInput[];
    cursor?: Prisma.SessionWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.SessionScalarFieldEnum | Prisma.SessionScalarFieldEnum[];
};
/**
 * User.projectMembers
 */
export type User$projectMembersArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
 * User.sharesGranted
 */
export type User$sharesGrantedArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
 * User.sharesCreated
 */
export type User$sharesCreatedArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
 * User without action
 */
export type UserDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: Prisma.UserSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the User
     */
    omit?: Prisma.UserOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.UserInclude<ExtArgs> | null;
};
