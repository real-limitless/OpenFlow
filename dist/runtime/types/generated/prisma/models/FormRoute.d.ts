import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model FormRoute
 *
 */
export type FormRouteModel = runtime.Types.Result.DefaultSelection<Prisma.$FormRoutePayload>;
export type AggregateFormRoute = {
    _count: FormRouteCountAggregateOutputType | null;
    _min: FormRouteMinAggregateOutputType | null;
    _max: FormRouteMaxAggregateOutputType | null;
};
export type FormRouteMinAggregateOutputType = {
    id: string | null;
    path: string | null;
    workflowId: string | null;
    nodeId: string | null;
    active: boolean | null;
};
export type FormRouteMaxAggregateOutputType = {
    id: string | null;
    path: string | null;
    workflowId: string | null;
    nodeId: string | null;
    active: boolean | null;
};
export type FormRouteCountAggregateOutputType = {
    id: number;
    path: number;
    workflowId: number;
    nodeId: number;
    active: number;
    _all: number;
};
export type FormRouteMinAggregateInputType = {
    id?: true;
    path?: true;
    workflowId?: true;
    nodeId?: true;
    active?: true;
};
export type FormRouteMaxAggregateInputType = {
    id?: true;
    path?: true;
    workflowId?: true;
    nodeId?: true;
    active?: true;
};
export type FormRouteCountAggregateInputType = {
    id?: true;
    path?: true;
    workflowId?: true;
    nodeId?: true;
    active?: true;
    _all?: true;
};
export type FormRouteAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which FormRoute to aggregate.
     */
    where?: Prisma.FormRouteWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of FormRoutes to fetch.
     */
    orderBy?: Prisma.FormRouteOrderByWithRelationInput | Prisma.FormRouteOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.FormRouteWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` FormRoutes from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` FormRoutes.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned FormRoutes
    **/
    _count?: true | FormRouteCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: FormRouteMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: FormRouteMaxAggregateInputType;
};
export type GetFormRouteAggregateType<T extends FormRouteAggregateArgs> = {
    [P in keyof T & keyof AggregateFormRoute]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateFormRoute[P]> : Prisma.GetScalarType<T[P], AggregateFormRoute[P]>;
};
export type FormRouteGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.FormRouteWhereInput;
    orderBy?: Prisma.FormRouteOrderByWithAggregationInput | Prisma.FormRouteOrderByWithAggregationInput[];
    by: Prisma.FormRouteScalarFieldEnum[] | Prisma.FormRouteScalarFieldEnum;
    having?: Prisma.FormRouteScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: FormRouteCountAggregateInputType | true;
    _min?: FormRouteMinAggregateInputType;
    _max?: FormRouteMaxAggregateInputType;
};
export type FormRouteGroupByOutputType = {
    id: string;
    path: string;
    workflowId: string;
    nodeId: string;
    active: boolean;
    _count: FormRouteCountAggregateOutputType | null;
    _min: FormRouteMinAggregateOutputType | null;
    _max: FormRouteMaxAggregateOutputType | null;
};
export type GetFormRouteGroupByPayload<T extends FormRouteGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<FormRouteGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof FormRouteGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], FormRouteGroupByOutputType[P]> : Prisma.GetScalarType<T[P], FormRouteGroupByOutputType[P]>;
}>>;
export type FormRouteWhereInput = {
    AND?: Prisma.FormRouteWhereInput | Prisma.FormRouteWhereInput[];
    OR?: Prisma.FormRouteWhereInput[];
    NOT?: Prisma.FormRouteWhereInput | Prisma.FormRouteWhereInput[];
    id?: Prisma.StringFilter<"FormRoute"> | string;
    path?: Prisma.StringFilter<"FormRoute"> | string;
    workflowId?: Prisma.StringFilter<"FormRoute"> | string;
    nodeId?: Prisma.StringFilter<"FormRoute"> | string;
    active?: Prisma.BoolFilter<"FormRoute"> | boolean;
    workflow?: Prisma.XOR<Prisma.WorkflowScalarRelationFilter, Prisma.WorkflowWhereInput>;
};
export type FormRouteOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    workflow?: Prisma.WorkflowOrderByWithRelationInput;
};
export type FormRouteWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    path?: string;
    AND?: Prisma.FormRouteWhereInput | Prisma.FormRouteWhereInput[];
    OR?: Prisma.FormRouteWhereInput[];
    NOT?: Prisma.FormRouteWhereInput | Prisma.FormRouteWhereInput[];
    workflowId?: Prisma.StringFilter<"FormRoute"> | string;
    nodeId?: Prisma.StringFilter<"FormRoute"> | string;
    active?: Prisma.BoolFilter<"FormRoute"> | boolean;
    workflow?: Prisma.XOR<Prisma.WorkflowScalarRelationFilter, Prisma.WorkflowWhereInput>;
}, "id" | "path">;
export type FormRouteOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    _count?: Prisma.FormRouteCountOrderByAggregateInput;
    _max?: Prisma.FormRouteMaxOrderByAggregateInput;
    _min?: Prisma.FormRouteMinOrderByAggregateInput;
};
export type FormRouteScalarWhereWithAggregatesInput = {
    AND?: Prisma.FormRouteScalarWhereWithAggregatesInput | Prisma.FormRouteScalarWhereWithAggregatesInput[];
    OR?: Prisma.FormRouteScalarWhereWithAggregatesInput[];
    NOT?: Prisma.FormRouteScalarWhereWithAggregatesInput | Prisma.FormRouteScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"FormRoute"> | string;
    path?: Prisma.StringWithAggregatesFilter<"FormRoute"> | string;
    workflowId?: Prisma.StringWithAggregatesFilter<"FormRoute"> | string;
    nodeId?: Prisma.StringWithAggregatesFilter<"FormRoute"> | string;
    active?: Prisma.BoolWithAggregatesFilter<"FormRoute"> | boolean;
};
export type FormRouteCreateInput = {
    id?: string;
    path: string;
    nodeId: string;
    active?: boolean;
    workflow: Prisma.WorkflowCreateNestedOneWithoutFormRoutesInput;
};
export type FormRouteUncheckedCreateInput = {
    id?: string;
    path: string;
    workflowId: string;
    nodeId: string;
    active?: boolean;
};
export type FormRouteUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    workflow?: Prisma.WorkflowUpdateOneRequiredWithoutFormRoutesNestedInput;
};
export type FormRouteUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    workflowId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type FormRouteCreateManyInput = {
    id?: string;
    path: string;
    workflowId: string;
    nodeId: string;
    active?: boolean;
};
export type FormRouteUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type FormRouteUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    workflowId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type FormRouteListRelationFilter = {
    every?: Prisma.FormRouteWhereInput;
    some?: Prisma.FormRouteWhereInput;
    none?: Prisma.FormRouteWhereInput;
};
export type FormRouteOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type FormRouteCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
};
export type FormRouteMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
};
export type FormRouteMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
};
export type FormRouteCreateNestedManyWithoutWorkflowInput = {
    create?: Prisma.XOR<Prisma.FormRouteCreateWithoutWorkflowInput, Prisma.FormRouteUncheckedCreateWithoutWorkflowInput> | Prisma.FormRouteCreateWithoutWorkflowInput[] | Prisma.FormRouteUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.FormRouteCreateOrConnectWithoutWorkflowInput | Prisma.FormRouteCreateOrConnectWithoutWorkflowInput[];
    createMany?: Prisma.FormRouteCreateManyWorkflowInputEnvelope;
    connect?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
};
export type FormRouteUncheckedCreateNestedManyWithoutWorkflowInput = {
    create?: Prisma.XOR<Prisma.FormRouteCreateWithoutWorkflowInput, Prisma.FormRouteUncheckedCreateWithoutWorkflowInput> | Prisma.FormRouteCreateWithoutWorkflowInput[] | Prisma.FormRouteUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.FormRouteCreateOrConnectWithoutWorkflowInput | Prisma.FormRouteCreateOrConnectWithoutWorkflowInput[];
    createMany?: Prisma.FormRouteCreateManyWorkflowInputEnvelope;
    connect?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
};
export type FormRouteUpdateManyWithoutWorkflowNestedInput = {
    create?: Prisma.XOR<Prisma.FormRouteCreateWithoutWorkflowInput, Prisma.FormRouteUncheckedCreateWithoutWorkflowInput> | Prisma.FormRouteCreateWithoutWorkflowInput[] | Prisma.FormRouteUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.FormRouteCreateOrConnectWithoutWorkflowInput | Prisma.FormRouteCreateOrConnectWithoutWorkflowInput[];
    upsert?: Prisma.FormRouteUpsertWithWhereUniqueWithoutWorkflowInput | Prisma.FormRouteUpsertWithWhereUniqueWithoutWorkflowInput[];
    createMany?: Prisma.FormRouteCreateManyWorkflowInputEnvelope;
    set?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
    disconnect?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
    delete?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
    connect?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
    update?: Prisma.FormRouteUpdateWithWhereUniqueWithoutWorkflowInput | Prisma.FormRouteUpdateWithWhereUniqueWithoutWorkflowInput[];
    updateMany?: Prisma.FormRouteUpdateManyWithWhereWithoutWorkflowInput | Prisma.FormRouteUpdateManyWithWhereWithoutWorkflowInput[];
    deleteMany?: Prisma.FormRouteScalarWhereInput | Prisma.FormRouteScalarWhereInput[];
};
export type FormRouteUncheckedUpdateManyWithoutWorkflowNestedInput = {
    create?: Prisma.XOR<Prisma.FormRouteCreateWithoutWorkflowInput, Prisma.FormRouteUncheckedCreateWithoutWorkflowInput> | Prisma.FormRouteCreateWithoutWorkflowInput[] | Prisma.FormRouteUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.FormRouteCreateOrConnectWithoutWorkflowInput | Prisma.FormRouteCreateOrConnectWithoutWorkflowInput[];
    upsert?: Prisma.FormRouteUpsertWithWhereUniqueWithoutWorkflowInput | Prisma.FormRouteUpsertWithWhereUniqueWithoutWorkflowInput[];
    createMany?: Prisma.FormRouteCreateManyWorkflowInputEnvelope;
    set?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
    disconnect?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
    delete?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
    connect?: Prisma.FormRouteWhereUniqueInput | Prisma.FormRouteWhereUniqueInput[];
    update?: Prisma.FormRouteUpdateWithWhereUniqueWithoutWorkflowInput | Prisma.FormRouteUpdateWithWhereUniqueWithoutWorkflowInput[];
    updateMany?: Prisma.FormRouteUpdateManyWithWhereWithoutWorkflowInput | Prisma.FormRouteUpdateManyWithWhereWithoutWorkflowInput[];
    deleteMany?: Prisma.FormRouteScalarWhereInput | Prisma.FormRouteScalarWhereInput[];
};
export type FormRouteCreateWithoutWorkflowInput = {
    id?: string;
    path: string;
    nodeId: string;
    active?: boolean;
};
export type FormRouteUncheckedCreateWithoutWorkflowInput = {
    id?: string;
    path: string;
    nodeId: string;
    active?: boolean;
};
export type FormRouteCreateOrConnectWithoutWorkflowInput = {
    where: Prisma.FormRouteWhereUniqueInput;
    create: Prisma.XOR<Prisma.FormRouteCreateWithoutWorkflowInput, Prisma.FormRouteUncheckedCreateWithoutWorkflowInput>;
};
export type FormRouteCreateManyWorkflowInputEnvelope = {
    data: Prisma.FormRouteCreateManyWorkflowInput | Prisma.FormRouteCreateManyWorkflowInput[];
    skipDuplicates?: boolean;
};
export type FormRouteUpsertWithWhereUniqueWithoutWorkflowInput = {
    where: Prisma.FormRouteWhereUniqueInput;
    update: Prisma.XOR<Prisma.FormRouteUpdateWithoutWorkflowInput, Prisma.FormRouteUncheckedUpdateWithoutWorkflowInput>;
    create: Prisma.XOR<Prisma.FormRouteCreateWithoutWorkflowInput, Prisma.FormRouteUncheckedCreateWithoutWorkflowInput>;
};
export type FormRouteUpdateWithWhereUniqueWithoutWorkflowInput = {
    where: Prisma.FormRouteWhereUniqueInput;
    data: Prisma.XOR<Prisma.FormRouteUpdateWithoutWorkflowInput, Prisma.FormRouteUncheckedUpdateWithoutWorkflowInput>;
};
export type FormRouteUpdateManyWithWhereWithoutWorkflowInput = {
    where: Prisma.FormRouteScalarWhereInput;
    data: Prisma.XOR<Prisma.FormRouteUpdateManyMutationInput, Prisma.FormRouteUncheckedUpdateManyWithoutWorkflowInput>;
};
export type FormRouteScalarWhereInput = {
    AND?: Prisma.FormRouteScalarWhereInput | Prisma.FormRouteScalarWhereInput[];
    OR?: Prisma.FormRouteScalarWhereInput[];
    NOT?: Prisma.FormRouteScalarWhereInput | Prisma.FormRouteScalarWhereInput[];
    id?: Prisma.StringFilter<"FormRoute"> | string;
    path?: Prisma.StringFilter<"FormRoute"> | string;
    workflowId?: Prisma.StringFilter<"FormRoute"> | string;
    nodeId?: Prisma.StringFilter<"FormRoute"> | string;
    active?: Prisma.BoolFilter<"FormRoute"> | boolean;
};
export type FormRouteCreateManyWorkflowInput = {
    id?: string;
    path: string;
    nodeId: string;
    active?: boolean;
};
export type FormRouteUpdateWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type FormRouteUncheckedUpdateWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type FormRouteUncheckedUpdateManyWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type FormRouteSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    path?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    active?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["formRoute"]>;
export type FormRouteSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    path?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    active?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["formRoute"]>;
export type FormRouteSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    path?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    active?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["formRoute"]>;
export type FormRouteSelectScalar = {
    id?: boolean;
    path?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    active?: boolean;
};
export type FormRouteOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "path" | "workflowId" | "nodeId" | "active", ExtArgs["result"]["formRoute"]>;
export type FormRouteInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type FormRouteIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type FormRouteIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type $FormRoutePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "FormRoute";
    objects: {
        workflow: Prisma.$WorkflowPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        /**
         * URL slug only (served at /form/:path)
         */
        path: string;
        workflowId: string;
        nodeId: string;
        active: boolean;
    }, ExtArgs["result"]["formRoute"]>;
    composites: {};
};
export type FormRouteGetPayload<S extends boolean | null | undefined | FormRouteDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$FormRoutePayload, S>;
export type FormRouteCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<FormRouteFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: FormRouteCountAggregateInputType | true;
};
export interface FormRouteDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['FormRoute'];
        meta: {
            name: 'FormRoute';
        };
    };
    /**
     * Find zero or one FormRoute that matches the filter.
     * @param {FormRouteFindUniqueArgs} args - Arguments to find a FormRoute
     * @example
     * // Get one FormRoute
     * const formRoute = await prisma.formRoute.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends FormRouteFindUniqueArgs>(args: Prisma.SelectSubset<T, FormRouteFindUniqueArgs<ExtArgs>>): Prisma.Prisma__FormRouteClient<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one FormRoute that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {FormRouteFindUniqueOrThrowArgs} args - Arguments to find a FormRoute
     * @example
     * // Get one FormRoute
     * const formRoute = await prisma.formRoute.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends FormRouteFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, FormRouteFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__FormRouteClient<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first FormRoute that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FormRouteFindFirstArgs} args - Arguments to find a FormRoute
     * @example
     * // Get one FormRoute
     * const formRoute = await prisma.formRoute.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends FormRouteFindFirstArgs>(args?: Prisma.SelectSubset<T, FormRouteFindFirstArgs<ExtArgs>>): Prisma.Prisma__FormRouteClient<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first FormRoute that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FormRouteFindFirstOrThrowArgs} args - Arguments to find a FormRoute
     * @example
     * // Get one FormRoute
     * const formRoute = await prisma.formRoute.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends FormRouteFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, FormRouteFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__FormRouteClient<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more FormRoutes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FormRouteFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all FormRoutes
     * const formRoutes = await prisma.formRoute.findMany()
     *
     * // Get first 10 FormRoutes
     * const formRoutes = await prisma.formRoute.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const formRouteWithIdOnly = await prisma.formRoute.findMany({ select: { id: true } })
     *
     */
    findMany<T extends FormRouteFindManyArgs>(args?: Prisma.SelectSubset<T, FormRouteFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a FormRoute.
     * @param {FormRouteCreateArgs} args - Arguments to create a FormRoute.
     * @example
     * // Create one FormRoute
     * const FormRoute = await prisma.formRoute.create({
     *   data: {
     *     // ... data to create a FormRoute
     *   }
     * })
     *
     */
    create<T extends FormRouteCreateArgs>(args: Prisma.SelectSubset<T, FormRouteCreateArgs<ExtArgs>>): Prisma.Prisma__FormRouteClient<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many FormRoutes.
     * @param {FormRouteCreateManyArgs} args - Arguments to create many FormRoutes.
     * @example
     * // Create many FormRoutes
     * const formRoute = await prisma.formRoute.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends FormRouteCreateManyArgs>(args?: Prisma.SelectSubset<T, FormRouteCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many FormRoutes and returns the data saved in the database.
     * @param {FormRouteCreateManyAndReturnArgs} args - Arguments to create many FormRoutes.
     * @example
     * // Create many FormRoutes
     * const formRoute = await prisma.formRoute.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many FormRoutes and only return the `id`
     * const formRouteWithIdOnly = await prisma.formRoute.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends FormRouteCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, FormRouteCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a FormRoute.
     * @param {FormRouteDeleteArgs} args - Arguments to delete one FormRoute.
     * @example
     * // Delete one FormRoute
     * const FormRoute = await prisma.formRoute.delete({
     *   where: {
     *     // ... filter to delete one FormRoute
     *   }
     * })
     *
     */
    delete<T extends FormRouteDeleteArgs>(args: Prisma.SelectSubset<T, FormRouteDeleteArgs<ExtArgs>>): Prisma.Prisma__FormRouteClient<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one FormRoute.
     * @param {FormRouteUpdateArgs} args - Arguments to update one FormRoute.
     * @example
     * // Update one FormRoute
     * const formRoute = await prisma.formRoute.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends FormRouteUpdateArgs>(args: Prisma.SelectSubset<T, FormRouteUpdateArgs<ExtArgs>>): Prisma.Prisma__FormRouteClient<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more FormRoutes.
     * @param {FormRouteDeleteManyArgs} args - Arguments to filter FormRoutes to delete.
     * @example
     * // Delete a few FormRoutes
     * const { count } = await prisma.formRoute.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends FormRouteDeleteManyArgs>(args?: Prisma.SelectSubset<T, FormRouteDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more FormRoutes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FormRouteUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many FormRoutes
     * const formRoute = await prisma.formRoute.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends FormRouteUpdateManyArgs>(args: Prisma.SelectSubset<T, FormRouteUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more FormRoutes and returns the data updated in the database.
     * @param {FormRouteUpdateManyAndReturnArgs} args - Arguments to update many FormRoutes.
     * @example
     * // Update many FormRoutes
     * const formRoute = await prisma.formRoute.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more FormRoutes and only return the `id`
     * const formRouteWithIdOnly = await prisma.formRoute.updateManyAndReturn({
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
    updateManyAndReturn<T extends FormRouteUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, FormRouteUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one FormRoute.
     * @param {FormRouteUpsertArgs} args - Arguments to update or create a FormRoute.
     * @example
     * // Update or create a FormRoute
     * const formRoute = await prisma.formRoute.upsert({
     *   create: {
     *     // ... data to create a FormRoute
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the FormRoute we want to update
     *   }
     * })
     */
    upsert<T extends FormRouteUpsertArgs>(args: Prisma.SelectSubset<T, FormRouteUpsertArgs<ExtArgs>>): Prisma.Prisma__FormRouteClient<runtime.Types.Result.GetResult<Prisma.$FormRoutePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of FormRoutes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FormRouteCountArgs} args - Arguments to filter FormRoutes to count.
     * @example
     * // Count the number of FormRoutes
     * const count = await prisma.formRoute.count({
     *   where: {
     *     // ... the filter for the FormRoutes we want to count
     *   }
     * })
    **/
    count<T extends FormRouteCountArgs>(args?: Prisma.Subset<T, FormRouteCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], FormRouteCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a FormRoute.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FormRouteAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends FormRouteAggregateArgs>(args: Prisma.Subset<T, FormRouteAggregateArgs>): Prisma.PrismaPromise<GetFormRouteAggregateType<T>>;
    /**
     * Group by FormRoute.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FormRouteGroupByArgs} args - Group by arguments.
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
    groupBy<T extends FormRouteGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: FormRouteGroupByArgs['orderBy'];
    } : {
        orderBy?: FormRouteGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, FormRouteGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetFormRouteGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the FormRoute model
     */
    readonly fields: FormRouteFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for FormRoute.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__FormRouteClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
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
 * Fields of the FormRoute model
 */
export interface FormRouteFieldRefs {
    readonly id: Prisma.FieldRef<"FormRoute", 'String'>;
    readonly path: Prisma.FieldRef<"FormRoute", 'String'>;
    readonly workflowId: Prisma.FieldRef<"FormRoute", 'String'>;
    readonly nodeId: Prisma.FieldRef<"FormRoute", 'String'>;
    readonly active: Prisma.FieldRef<"FormRoute", 'Boolean'>;
}
/**
 * FormRoute findUnique
 */
export type FormRouteFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which FormRoute to fetch.
     */
    where: Prisma.FormRouteWhereUniqueInput;
};
/**
 * FormRoute findUniqueOrThrow
 */
export type FormRouteFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which FormRoute to fetch.
     */
    where: Prisma.FormRouteWhereUniqueInput;
};
/**
 * FormRoute findFirst
 */
export type FormRouteFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which FormRoute to fetch.
     */
    where?: Prisma.FormRouteWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of FormRoutes to fetch.
     */
    orderBy?: Prisma.FormRouteOrderByWithRelationInput | Prisma.FormRouteOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for FormRoutes.
     */
    cursor?: Prisma.FormRouteWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` FormRoutes from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` FormRoutes.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of FormRoutes.
     */
    distinct?: Prisma.FormRouteScalarFieldEnum | Prisma.FormRouteScalarFieldEnum[];
};
/**
 * FormRoute findFirstOrThrow
 */
export type FormRouteFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which FormRoute to fetch.
     */
    where?: Prisma.FormRouteWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of FormRoutes to fetch.
     */
    orderBy?: Prisma.FormRouteOrderByWithRelationInput | Prisma.FormRouteOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for FormRoutes.
     */
    cursor?: Prisma.FormRouteWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` FormRoutes from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` FormRoutes.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of FormRoutes.
     */
    distinct?: Prisma.FormRouteScalarFieldEnum | Prisma.FormRouteScalarFieldEnum[];
};
/**
 * FormRoute findMany
 */
export type FormRouteFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which FormRoutes to fetch.
     */
    where?: Prisma.FormRouteWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of FormRoutes to fetch.
     */
    orderBy?: Prisma.FormRouteOrderByWithRelationInput | Prisma.FormRouteOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing FormRoutes.
     */
    cursor?: Prisma.FormRouteWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` FormRoutes from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` FormRoutes.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of FormRoutes.
     */
    distinct?: Prisma.FormRouteScalarFieldEnum | Prisma.FormRouteScalarFieldEnum[];
};
/**
 * FormRoute create
 */
export type FormRouteCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a FormRoute.
     */
    data: Prisma.XOR<Prisma.FormRouteCreateInput, Prisma.FormRouteUncheckedCreateInput>;
};
/**
 * FormRoute createMany
 */
export type FormRouteCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many FormRoutes.
     */
    data: Prisma.FormRouteCreateManyInput | Prisma.FormRouteCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * FormRoute createManyAndReturn
 */
export type FormRouteCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FormRoute
     */
    select?: Prisma.FormRouteSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the FormRoute
     */
    omit?: Prisma.FormRouteOmit<ExtArgs> | null;
    /**
     * The data used to create many FormRoutes.
     */
    data: Prisma.FormRouteCreateManyInput | Prisma.FormRouteCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.FormRouteIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * FormRoute update
 */
export type FormRouteUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a FormRoute.
     */
    data: Prisma.XOR<Prisma.FormRouteUpdateInput, Prisma.FormRouteUncheckedUpdateInput>;
    /**
     * Choose, which FormRoute to update.
     */
    where: Prisma.FormRouteWhereUniqueInput;
};
/**
 * FormRoute updateMany
 */
export type FormRouteUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update FormRoutes.
     */
    data: Prisma.XOR<Prisma.FormRouteUpdateManyMutationInput, Prisma.FormRouteUncheckedUpdateManyInput>;
    /**
     * Filter which FormRoutes to update
     */
    where?: Prisma.FormRouteWhereInput;
    /**
     * Limit how many FormRoutes to update.
     */
    limit?: number;
};
/**
 * FormRoute updateManyAndReturn
 */
export type FormRouteUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FormRoute
     */
    select?: Prisma.FormRouteSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the FormRoute
     */
    omit?: Prisma.FormRouteOmit<ExtArgs> | null;
    /**
     * The data used to update FormRoutes.
     */
    data: Prisma.XOR<Prisma.FormRouteUpdateManyMutationInput, Prisma.FormRouteUncheckedUpdateManyInput>;
    /**
     * Filter which FormRoutes to update
     */
    where?: Prisma.FormRouteWhereInput;
    /**
     * Limit how many FormRoutes to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.FormRouteIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * FormRoute upsert
 */
export type FormRouteUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the FormRoute to update in case it exists.
     */
    where: Prisma.FormRouteWhereUniqueInput;
    /**
     * In case the FormRoute found by the `where` argument doesn't exist, create a new FormRoute with this data.
     */
    create: Prisma.XOR<Prisma.FormRouteCreateInput, Prisma.FormRouteUncheckedCreateInput>;
    /**
     * In case the FormRoute was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.FormRouteUpdateInput, Prisma.FormRouteUncheckedUpdateInput>;
};
/**
 * FormRoute delete
 */
export type FormRouteDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which FormRoute to delete.
     */
    where: Prisma.FormRouteWhereUniqueInput;
};
/**
 * FormRoute deleteMany
 */
export type FormRouteDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which FormRoutes to delete
     */
    where?: Prisma.FormRouteWhereInput;
    /**
     * Limit how many FormRoutes to delete.
     */
    limit?: number;
};
/**
 * FormRoute without action
 */
export type FormRouteDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
