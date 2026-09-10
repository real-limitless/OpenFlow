import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model SecretProvider
 *
 */
export type SecretProviderModel = runtime.Types.Result.DefaultSelection<Prisma.$SecretProviderPayload>;
export type AggregateSecretProvider = {
    _count: SecretProviderCountAggregateOutputType | null;
    _min: SecretProviderMinAggregateOutputType | null;
    _max: SecretProviderMaxAggregateOutputType | null;
};
export type SecretProviderMinAggregateOutputType = {
    id: string | null;
    name: string | null;
    type: string | null;
    configEncrypted: string | null;
    isDefault: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type SecretProviderMaxAggregateOutputType = {
    id: string | null;
    name: string | null;
    type: string | null;
    configEncrypted: string | null;
    isDefault: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type SecretProviderCountAggregateOutputType = {
    id: number;
    name: number;
    type: number;
    configEncrypted: number;
    isDefault: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type SecretProviderMinAggregateInputType = {
    id?: true;
    name?: true;
    type?: true;
    configEncrypted?: true;
    isDefault?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type SecretProviderMaxAggregateInputType = {
    id?: true;
    name?: true;
    type?: true;
    configEncrypted?: true;
    isDefault?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type SecretProviderCountAggregateInputType = {
    id?: true;
    name?: true;
    type?: true;
    configEncrypted?: true;
    isDefault?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type SecretProviderAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which SecretProvider to aggregate.
     */
    where?: Prisma.SecretProviderWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SecretProviders to fetch.
     */
    orderBy?: Prisma.SecretProviderOrderByWithRelationInput | Prisma.SecretProviderOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.SecretProviderWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SecretProviders from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SecretProviders.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned SecretProviders
    **/
    _count?: true | SecretProviderCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: SecretProviderMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: SecretProviderMaxAggregateInputType;
};
export type GetSecretProviderAggregateType<T extends SecretProviderAggregateArgs> = {
    [P in keyof T & keyof AggregateSecretProvider]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateSecretProvider[P]> : Prisma.GetScalarType<T[P], AggregateSecretProvider[P]>;
};
export type SecretProviderGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SecretProviderWhereInput;
    orderBy?: Prisma.SecretProviderOrderByWithAggregationInput | Prisma.SecretProviderOrderByWithAggregationInput[];
    by: Prisma.SecretProviderScalarFieldEnum[] | Prisma.SecretProviderScalarFieldEnum;
    having?: Prisma.SecretProviderScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: SecretProviderCountAggregateInputType | true;
    _min?: SecretProviderMinAggregateInputType;
    _max?: SecretProviderMaxAggregateInputType;
};
export type SecretProviderGroupByOutputType = {
    id: string;
    name: string;
    type: string;
    configEncrypted: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: SecretProviderCountAggregateOutputType | null;
    _min: SecretProviderMinAggregateOutputType | null;
    _max: SecretProviderMaxAggregateOutputType | null;
};
export type GetSecretProviderGroupByPayload<T extends SecretProviderGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<SecretProviderGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof SecretProviderGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], SecretProviderGroupByOutputType[P]> : Prisma.GetScalarType<T[P], SecretProviderGroupByOutputType[P]>;
}>>;
export type SecretProviderWhereInput = {
    AND?: Prisma.SecretProviderWhereInput | Prisma.SecretProviderWhereInput[];
    OR?: Prisma.SecretProviderWhereInput[];
    NOT?: Prisma.SecretProviderWhereInput | Prisma.SecretProviderWhereInput[];
    id?: Prisma.StringFilter<"SecretProvider"> | string;
    name?: Prisma.StringFilter<"SecretProvider"> | string;
    type?: Prisma.StringFilter<"SecretProvider"> | string;
    configEncrypted?: Prisma.StringFilter<"SecretProvider"> | string;
    isDefault?: Prisma.BoolFilter<"SecretProvider"> | boolean;
    createdAt?: Prisma.DateTimeFilter<"SecretProvider"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"SecretProvider"> | Date | string;
    credentials?: Prisma.CredentialListRelationFilter;
};
export type SecretProviderOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    configEncrypted?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    credentials?: Prisma.CredentialOrderByRelationAggregateInput;
};
export type SecretProviderWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.SecretProviderWhereInput | Prisma.SecretProviderWhereInput[];
    OR?: Prisma.SecretProviderWhereInput[];
    NOT?: Prisma.SecretProviderWhereInput | Prisma.SecretProviderWhereInput[];
    name?: Prisma.StringFilter<"SecretProvider"> | string;
    type?: Prisma.StringFilter<"SecretProvider"> | string;
    configEncrypted?: Prisma.StringFilter<"SecretProvider"> | string;
    isDefault?: Prisma.BoolFilter<"SecretProvider"> | boolean;
    createdAt?: Prisma.DateTimeFilter<"SecretProvider"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"SecretProvider"> | Date | string;
    credentials?: Prisma.CredentialListRelationFilter;
}, "id">;
export type SecretProviderOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    configEncrypted?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.SecretProviderCountOrderByAggregateInput;
    _max?: Prisma.SecretProviderMaxOrderByAggregateInput;
    _min?: Prisma.SecretProviderMinOrderByAggregateInput;
};
export type SecretProviderScalarWhereWithAggregatesInput = {
    AND?: Prisma.SecretProviderScalarWhereWithAggregatesInput | Prisma.SecretProviderScalarWhereWithAggregatesInput[];
    OR?: Prisma.SecretProviderScalarWhereWithAggregatesInput[];
    NOT?: Prisma.SecretProviderScalarWhereWithAggregatesInput | Prisma.SecretProviderScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"SecretProvider"> | string;
    name?: Prisma.StringWithAggregatesFilter<"SecretProvider"> | string;
    type?: Prisma.StringWithAggregatesFilter<"SecretProvider"> | string;
    configEncrypted?: Prisma.StringWithAggregatesFilter<"SecretProvider"> | string;
    isDefault?: Prisma.BoolWithAggregatesFilter<"SecretProvider"> | boolean;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"SecretProvider"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"SecretProvider"> | Date | string;
};
export type SecretProviderCreateInput = {
    id?: string;
    name: string;
    type: string;
    configEncrypted?: string;
    isDefault?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    credentials?: Prisma.CredentialCreateNestedManyWithoutSecretProviderInput;
};
export type SecretProviderUncheckedCreateInput = {
    id?: string;
    name: string;
    type: string;
    configEncrypted?: string;
    isDefault?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    credentials?: Prisma.CredentialUncheckedCreateNestedManyWithoutSecretProviderInput;
};
export type SecretProviderUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    configEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    credentials?: Prisma.CredentialUpdateManyWithoutSecretProviderNestedInput;
};
export type SecretProviderUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    configEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    credentials?: Prisma.CredentialUncheckedUpdateManyWithoutSecretProviderNestedInput;
};
export type SecretProviderCreateManyInput = {
    id?: string;
    name: string;
    type: string;
    configEncrypted?: string;
    isDefault?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type SecretProviderUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    configEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SecretProviderUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    configEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SecretProviderCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    configEncrypted?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type SecretProviderMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    configEncrypted?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type SecretProviderMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    configEncrypted?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type SecretProviderNullableScalarRelationFilter = {
    is?: Prisma.SecretProviderWhereInput | null;
    isNot?: Prisma.SecretProviderWhereInput | null;
};
export type SecretProviderCreateNestedOneWithoutCredentialsInput = {
    create?: Prisma.XOR<Prisma.SecretProviderCreateWithoutCredentialsInput, Prisma.SecretProviderUncheckedCreateWithoutCredentialsInput>;
    connectOrCreate?: Prisma.SecretProviderCreateOrConnectWithoutCredentialsInput;
    connect?: Prisma.SecretProviderWhereUniqueInput;
};
export type SecretProviderUpdateOneWithoutCredentialsNestedInput = {
    create?: Prisma.XOR<Prisma.SecretProviderCreateWithoutCredentialsInput, Prisma.SecretProviderUncheckedCreateWithoutCredentialsInput>;
    connectOrCreate?: Prisma.SecretProviderCreateOrConnectWithoutCredentialsInput;
    upsert?: Prisma.SecretProviderUpsertWithoutCredentialsInput;
    disconnect?: Prisma.SecretProviderWhereInput | boolean;
    delete?: Prisma.SecretProviderWhereInput | boolean;
    connect?: Prisma.SecretProviderWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.SecretProviderUpdateToOneWithWhereWithoutCredentialsInput, Prisma.SecretProviderUpdateWithoutCredentialsInput>, Prisma.SecretProviderUncheckedUpdateWithoutCredentialsInput>;
};
export type SecretProviderCreateWithoutCredentialsInput = {
    id?: string;
    name: string;
    type: string;
    configEncrypted?: string;
    isDefault?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type SecretProviderUncheckedCreateWithoutCredentialsInput = {
    id?: string;
    name: string;
    type: string;
    configEncrypted?: string;
    isDefault?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type SecretProviderCreateOrConnectWithoutCredentialsInput = {
    where: Prisma.SecretProviderWhereUniqueInput;
    create: Prisma.XOR<Prisma.SecretProviderCreateWithoutCredentialsInput, Prisma.SecretProviderUncheckedCreateWithoutCredentialsInput>;
};
export type SecretProviderUpsertWithoutCredentialsInput = {
    update: Prisma.XOR<Prisma.SecretProviderUpdateWithoutCredentialsInput, Prisma.SecretProviderUncheckedUpdateWithoutCredentialsInput>;
    create: Prisma.XOR<Prisma.SecretProviderCreateWithoutCredentialsInput, Prisma.SecretProviderUncheckedCreateWithoutCredentialsInput>;
    where?: Prisma.SecretProviderWhereInput;
};
export type SecretProviderUpdateToOneWithWhereWithoutCredentialsInput = {
    where?: Prisma.SecretProviderWhereInput;
    data: Prisma.XOR<Prisma.SecretProviderUpdateWithoutCredentialsInput, Prisma.SecretProviderUncheckedUpdateWithoutCredentialsInput>;
};
export type SecretProviderUpdateWithoutCredentialsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    configEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SecretProviderUncheckedUpdateWithoutCredentialsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    configEncrypted?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
/**
 * Count Type SecretProviderCountOutputType
 */
export type SecretProviderCountOutputType = {
    credentials: number;
};
export type SecretProviderCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    credentials?: boolean | SecretProviderCountOutputTypeCountCredentialsArgs;
};
/**
 * SecretProviderCountOutputType without action
 */
export type SecretProviderCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SecretProviderCountOutputType
     */
    select?: Prisma.SecretProviderCountOutputTypeSelect<ExtArgs> | null;
};
/**
 * SecretProviderCountOutputType without action
 */
export type SecretProviderCountOutputTypeCountCredentialsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.CredentialWhereInput;
};
export type SecretProviderSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    type?: boolean;
    configEncrypted?: boolean;
    isDefault?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    credentials?: boolean | Prisma.SecretProvider$credentialsArgs<ExtArgs>;
    _count?: boolean | Prisma.SecretProviderCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["secretProvider"]>;
export type SecretProviderSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    type?: boolean;
    configEncrypted?: boolean;
    isDefault?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["secretProvider"]>;
export type SecretProviderSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    type?: boolean;
    configEncrypted?: boolean;
    isDefault?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["secretProvider"]>;
export type SecretProviderSelectScalar = {
    id?: boolean;
    name?: boolean;
    type?: boolean;
    configEncrypted?: boolean;
    isDefault?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type SecretProviderOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "name" | "type" | "configEncrypted" | "isDefault" | "createdAt" | "updatedAt", ExtArgs["result"]["secretProvider"]>;
export type SecretProviderInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    credentials?: boolean | Prisma.SecretProvider$credentialsArgs<ExtArgs>;
    _count?: boolean | Prisma.SecretProviderCountOutputTypeDefaultArgs<ExtArgs>;
};
export type SecretProviderIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type SecretProviderIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type $SecretProviderPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "SecretProvider";
    objects: {
        credentials: Prisma.$CredentialPayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        name: string;
        /**
         * local | vault | aws-sm
         */
        type: string;
        /**
         * AES-encrypted JSON connection config (token, addr, region, …)
         */
        configEncrypted: string;
        isDefault: boolean;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["secretProvider"]>;
    composites: {};
};
export type SecretProviderGetPayload<S extends boolean | null | undefined | SecretProviderDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload, S>;
export type SecretProviderCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<SecretProviderFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: SecretProviderCountAggregateInputType | true;
};
export interface SecretProviderDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['SecretProvider'];
        meta: {
            name: 'SecretProvider';
        };
    };
    /**
     * Find zero or one SecretProvider that matches the filter.
     * @param {SecretProviderFindUniqueArgs} args - Arguments to find a SecretProvider
     * @example
     * // Get one SecretProvider
     * const secretProvider = await prisma.secretProvider.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SecretProviderFindUniqueArgs>(args: Prisma.SelectSubset<T, SecretProviderFindUniqueArgs<ExtArgs>>): Prisma.Prisma__SecretProviderClient<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one SecretProvider that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SecretProviderFindUniqueOrThrowArgs} args - Arguments to find a SecretProvider
     * @example
     * // Get one SecretProvider
     * const secretProvider = await prisma.secretProvider.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SecretProviderFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, SecretProviderFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__SecretProviderClient<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first SecretProvider that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SecretProviderFindFirstArgs} args - Arguments to find a SecretProvider
     * @example
     * // Get one SecretProvider
     * const secretProvider = await prisma.secretProvider.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SecretProviderFindFirstArgs>(args?: Prisma.SelectSubset<T, SecretProviderFindFirstArgs<ExtArgs>>): Prisma.Prisma__SecretProviderClient<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first SecretProvider that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SecretProviderFindFirstOrThrowArgs} args - Arguments to find a SecretProvider
     * @example
     * // Get one SecretProvider
     * const secretProvider = await prisma.secretProvider.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SecretProviderFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, SecretProviderFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__SecretProviderClient<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more SecretProviders that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SecretProviderFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SecretProviders
     * const secretProviders = await prisma.secretProvider.findMany()
     *
     * // Get first 10 SecretProviders
     * const secretProviders = await prisma.secretProvider.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const secretProviderWithIdOnly = await prisma.secretProvider.findMany({ select: { id: true } })
     *
     */
    findMany<T extends SecretProviderFindManyArgs>(args?: Prisma.SelectSubset<T, SecretProviderFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a SecretProvider.
     * @param {SecretProviderCreateArgs} args - Arguments to create a SecretProvider.
     * @example
     * // Create one SecretProvider
     * const SecretProvider = await prisma.secretProvider.create({
     *   data: {
     *     // ... data to create a SecretProvider
     *   }
     * })
     *
     */
    create<T extends SecretProviderCreateArgs>(args: Prisma.SelectSubset<T, SecretProviderCreateArgs<ExtArgs>>): Prisma.Prisma__SecretProviderClient<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many SecretProviders.
     * @param {SecretProviderCreateManyArgs} args - Arguments to create many SecretProviders.
     * @example
     * // Create many SecretProviders
     * const secretProvider = await prisma.secretProvider.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends SecretProviderCreateManyArgs>(args?: Prisma.SelectSubset<T, SecretProviderCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many SecretProviders and returns the data saved in the database.
     * @param {SecretProviderCreateManyAndReturnArgs} args - Arguments to create many SecretProviders.
     * @example
     * // Create many SecretProviders
     * const secretProvider = await prisma.secretProvider.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many SecretProviders and only return the `id`
     * const secretProviderWithIdOnly = await prisma.secretProvider.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends SecretProviderCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, SecretProviderCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a SecretProvider.
     * @param {SecretProviderDeleteArgs} args - Arguments to delete one SecretProvider.
     * @example
     * // Delete one SecretProvider
     * const SecretProvider = await prisma.secretProvider.delete({
     *   where: {
     *     // ... filter to delete one SecretProvider
     *   }
     * })
     *
     */
    delete<T extends SecretProviderDeleteArgs>(args: Prisma.SelectSubset<T, SecretProviderDeleteArgs<ExtArgs>>): Prisma.Prisma__SecretProviderClient<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one SecretProvider.
     * @param {SecretProviderUpdateArgs} args - Arguments to update one SecretProvider.
     * @example
     * // Update one SecretProvider
     * const secretProvider = await prisma.secretProvider.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends SecretProviderUpdateArgs>(args: Prisma.SelectSubset<T, SecretProviderUpdateArgs<ExtArgs>>): Prisma.Prisma__SecretProviderClient<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more SecretProviders.
     * @param {SecretProviderDeleteManyArgs} args - Arguments to filter SecretProviders to delete.
     * @example
     * // Delete a few SecretProviders
     * const { count } = await prisma.secretProvider.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends SecretProviderDeleteManyArgs>(args?: Prisma.SelectSubset<T, SecretProviderDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more SecretProviders.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SecretProviderUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SecretProviders
     * const secretProvider = await prisma.secretProvider.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends SecretProviderUpdateManyArgs>(args: Prisma.SelectSubset<T, SecretProviderUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more SecretProviders and returns the data updated in the database.
     * @param {SecretProviderUpdateManyAndReturnArgs} args - Arguments to update many SecretProviders.
     * @example
     * // Update many SecretProviders
     * const secretProvider = await prisma.secretProvider.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more SecretProviders and only return the `id`
     * const secretProviderWithIdOnly = await prisma.secretProvider.updateManyAndReturn({
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
    updateManyAndReturn<T extends SecretProviderUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, SecretProviderUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one SecretProvider.
     * @param {SecretProviderUpsertArgs} args - Arguments to update or create a SecretProvider.
     * @example
     * // Update or create a SecretProvider
     * const secretProvider = await prisma.secretProvider.upsert({
     *   create: {
     *     // ... data to create a SecretProvider
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SecretProvider we want to update
     *   }
     * })
     */
    upsert<T extends SecretProviderUpsertArgs>(args: Prisma.SelectSubset<T, SecretProviderUpsertArgs<ExtArgs>>): Prisma.Prisma__SecretProviderClient<runtime.Types.Result.GetResult<Prisma.$SecretProviderPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of SecretProviders.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SecretProviderCountArgs} args - Arguments to filter SecretProviders to count.
     * @example
     * // Count the number of SecretProviders
     * const count = await prisma.secretProvider.count({
     *   where: {
     *     // ... the filter for the SecretProviders we want to count
     *   }
     * })
    **/
    count<T extends SecretProviderCountArgs>(args?: Prisma.Subset<T, SecretProviderCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], SecretProviderCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a SecretProvider.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SecretProviderAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SecretProviderAggregateArgs>(args: Prisma.Subset<T, SecretProviderAggregateArgs>): Prisma.PrismaPromise<GetSecretProviderAggregateType<T>>;
    /**
     * Group by SecretProvider.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SecretProviderGroupByArgs} args - Group by arguments.
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
    groupBy<T extends SecretProviderGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: SecretProviderGroupByArgs['orderBy'];
    } : {
        orderBy?: SecretProviderGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, SecretProviderGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSecretProviderGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the SecretProvider model
     */
    readonly fields: SecretProviderFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for SecretProvider.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__SecretProviderClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    credentials<T extends Prisma.SecretProvider$credentialsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.SecretProvider$credentialsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CredentialPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
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
 * Fields of the SecretProvider model
 */
export interface SecretProviderFieldRefs {
    readonly id: Prisma.FieldRef<"SecretProvider", 'String'>;
    readonly name: Prisma.FieldRef<"SecretProvider", 'String'>;
    readonly type: Prisma.FieldRef<"SecretProvider", 'String'>;
    readonly configEncrypted: Prisma.FieldRef<"SecretProvider", 'String'>;
    readonly isDefault: Prisma.FieldRef<"SecretProvider", 'Boolean'>;
    readonly createdAt: Prisma.FieldRef<"SecretProvider", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"SecretProvider", 'DateTime'>;
}
/**
 * SecretProvider findUnique
 */
export type SecretProviderFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which SecretProvider to fetch.
     */
    where: Prisma.SecretProviderWhereUniqueInput;
};
/**
 * SecretProvider findUniqueOrThrow
 */
export type SecretProviderFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which SecretProvider to fetch.
     */
    where: Prisma.SecretProviderWhereUniqueInput;
};
/**
 * SecretProvider findFirst
 */
export type SecretProviderFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which SecretProvider to fetch.
     */
    where?: Prisma.SecretProviderWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SecretProviders to fetch.
     */
    orderBy?: Prisma.SecretProviderOrderByWithRelationInput | Prisma.SecretProviderOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for SecretProviders.
     */
    cursor?: Prisma.SecretProviderWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SecretProviders from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SecretProviders.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SecretProviders.
     */
    distinct?: Prisma.SecretProviderScalarFieldEnum | Prisma.SecretProviderScalarFieldEnum[];
};
/**
 * SecretProvider findFirstOrThrow
 */
export type SecretProviderFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which SecretProvider to fetch.
     */
    where?: Prisma.SecretProviderWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SecretProviders to fetch.
     */
    orderBy?: Prisma.SecretProviderOrderByWithRelationInput | Prisma.SecretProviderOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for SecretProviders.
     */
    cursor?: Prisma.SecretProviderWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SecretProviders from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SecretProviders.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SecretProviders.
     */
    distinct?: Prisma.SecretProviderScalarFieldEnum | Prisma.SecretProviderScalarFieldEnum[];
};
/**
 * SecretProvider findMany
 */
export type SecretProviderFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which SecretProviders to fetch.
     */
    where?: Prisma.SecretProviderWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SecretProviders to fetch.
     */
    orderBy?: Prisma.SecretProviderOrderByWithRelationInput | Prisma.SecretProviderOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing SecretProviders.
     */
    cursor?: Prisma.SecretProviderWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SecretProviders from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SecretProviders.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SecretProviders.
     */
    distinct?: Prisma.SecretProviderScalarFieldEnum | Prisma.SecretProviderScalarFieldEnum[];
};
/**
 * SecretProvider create
 */
export type SecretProviderCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a SecretProvider.
     */
    data: Prisma.XOR<Prisma.SecretProviderCreateInput, Prisma.SecretProviderUncheckedCreateInput>;
};
/**
 * SecretProvider createMany
 */
export type SecretProviderCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many SecretProviders.
     */
    data: Prisma.SecretProviderCreateManyInput | Prisma.SecretProviderCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * SecretProvider createManyAndReturn
 */
export type SecretProviderCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SecretProvider
     */
    select?: Prisma.SecretProviderSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the SecretProvider
     */
    omit?: Prisma.SecretProviderOmit<ExtArgs> | null;
    /**
     * The data used to create many SecretProviders.
     */
    data: Prisma.SecretProviderCreateManyInput | Prisma.SecretProviderCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * SecretProvider update
 */
export type SecretProviderUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a SecretProvider.
     */
    data: Prisma.XOR<Prisma.SecretProviderUpdateInput, Prisma.SecretProviderUncheckedUpdateInput>;
    /**
     * Choose, which SecretProvider to update.
     */
    where: Prisma.SecretProviderWhereUniqueInput;
};
/**
 * SecretProvider updateMany
 */
export type SecretProviderUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update SecretProviders.
     */
    data: Prisma.XOR<Prisma.SecretProviderUpdateManyMutationInput, Prisma.SecretProviderUncheckedUpdateManyInput>;
    /**
     * Filter which SecretProviders to update
     */
    where?: Prisma.SecretProviderWhereInput;
    /**
     * Limit how many SecretProviders to update.
     */
    limit?: number;
};
/**
 * SecretProvider updateManyAndReturn
 */
export type SecretProviderUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SecretProvider
     */
    select?: Prisma.SecretProviderSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the SecretProvider
     */
    omit?: Prisma.SecretProviderOmit<ExtArgs> | null;
    /**
     * The data used to update SecretProviders.
     */
    data: Prisma.XOR<Prisma.SecretProviderUpdateManyMutationInput, Prisma.SecretProviderUncheckedUpdateManyInput>;
    /**
     * Filter which SecretProviders to update
     */
    where?: Prisma.SecretProviderWhereInput;
    /**
     * Limit how many SecretProviders to update.
     */
    limit?: number;
};
/**
 * SecretProvider upsert
 */
export type SecretProviderUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the SecretProvider to update in case it exists.
     */
    where: Prisma.SecretProviderWhereUniqueInput;
    /**
     * In case the SecretProvider found by the `where` argument doesn't exist, create a new SecretProvider with this data.
     */
    create: Prisma.XOR<Prisma.SecretProviderCreateInput, Prisma.SecretProviderUncheckedCreateInput>;
    /**
     * In case the SecretProvider was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.SecretProviderUpdateInput, Prisma.SecretProviderUncheckedUpdateInput>;
};
/**
 * SecretProvider delete
 */
export type SecretProviderDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which SecretProvider to delete.
     */
    where: Prisma.SecretProviderWhereUniqueInput;
};
/**
 * SecretProvider deleteMany
 */
export type SecretProviderDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which SecretProviders to delete
     */
    where?: Prisma.SecretProviderWhereInput;
    /**
     * Limit how many SecretProviders to delete.
     */
    limit?: number;
};
/**
 * SecretProvider.credentials
 */
export type SecretProvider$credentialsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
 * SecretProvider without action
 */
export type SecretProviderDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
