import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model WebhookRoute
 *
 */
export type WebhookRouteModel = runtime.Types.Result.DefaultSelection<Prisma.$WebhookRoutePayload>;
export type AggregateWebhookRoute = {
    _count: WebhookRouteCountAggregateOutputType | null;
    _min: WebhookRouteMinAggregateOutputType | null;
    _max: WebhookRouteMaxAggregateOutputType | null;
};
export type WebhookRouteMinAggregateOutputType = {
    id: string | null;
    path: string | null;
    workflowId: string | null;
    nodeId: string | null;
    method: string | null;
    active: boolean | null;
};
export type WebhookRouteMaxAggregateOutputType = {
    id: string | null;
    path: string | null;
    workflowId: string | null;
    nodeId: string | null;
    method: string | null;
    active: boolean | null;
};
export type WebhookRouteCountAggregateOutputType = {
    id: number;
    path: number;
    workflowId: number;
    nodeId: number;
    method: number;
    active: number;
    _all: number;
};
export type WebhookRouteMinAggregateInputType = {
    id?: true;
    path?: true;
    workflowId?: true;
    nodeId?: true;
    method?: true;
    active?: true;
};
export type WebhookRouteMaxAggregateInputType = {
    id?: true;
    path?: true;
    workflowId?: true;
    nodeId?: true;
    method?: true;
    active?: true;
};
export type WebhookRouteCountAggregateInputType = {
    id?: true;
    path?: true;
    workflowId?: true;
    nodeId?: true;
    method?: true;
    active?: true;
    _all?: true;
};
export type WebhookRouteAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which WebhookRoute to aggregate.
     */
    where?: Prisma.WebhookRouteWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of WebhookRoutes to fetch.
     */
    orderBy?: Prisma.WebhookRouteOrderByWithRelationInput | Prisma.WebhookRouteOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.WebhookRouteWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` WebhookRoutes from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` WebhookRoutes.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned WebhookRoutes
    **/
    _count?: true | WebhookRouteCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: WebhookRouteMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: WebhookRouteMaxAggregateInputType;
};
export type GetWebhookRouteAggregateType<T extends WebhookRouteAggregateArgs> = {
    [P in keyof T & keyof AggregateWebhookRoute]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateWebhookRoute[P]> : Prisma.GetScalarType<T[P], AggregateWebhookRoute[P]>;
};
export type WebhookRouteGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.WebhookRouteWhereInput;
    orderBy?: Prisma.WebhookRouteOrderByWithAggregationInput | Prisma.WebhookRouteOrderByWithAggregationInput[];
    by: Prisma.WebhookRouteScalarFieldEnum[] | Prisma.WebhookRouteScalarFieldEnum;
    having?: Prisma.WebhookRouteScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: WebhookRouteCountAggregateInputType | true;
    _min?: WebhookRouteMinAggregateInputType;
    _max?: WebhookRouteMaxAggregateInputType;
};
export type WebhookRouteGroupByOutputType = {
    id: string;
    path: string;
    workflowId: string;
    nodeId: string;
    method: string;
    active: boolean;
    _count: WebhookRouteCountAggregateOutputType | null;
    _min: WebhookRouteMinAggregateOutputType | null;
    _max: WebhookRouteMaxAggregateOutputType | null;
};
export type GetWebhookRouteGroupByPayload<T extends WebhookRouteGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<WebhookRouteGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof WebhookRouteGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], WebhookRouteGroupByOutputType[P]> : Prisma.GetScalarType<T[P], WebhookRouteGroupByOutputType[P]>;
}>>;
export type WebhookRouteWhereInput = {
    AND?: Prisma.WebhookRouteWhereInput | Prisma.WebhookRouteWhereInput[];
    OR?: Prisma.WebhookRouteWhereInput[];
    NOT?: Prisma.WebhookRouteWhereInput | Prisma.WebhookRouteWhereInput[];
    id?: Prisma.StringFilter<"WebhookRoute"> | string;
    path?: Prisma.StringFilter<"WebhookRoute"> | string;
    workflowId?: Prisma.StringFilter<"WebhookRoute"> | string;
    nodeId?: Prisma.StringFilter<"WebhookRoute"> | string;
    method?: Prisma.StringFilter<"WebhookRoute"> | string;
    active?: Prisma.BoolFilter<"WebhookRoute"> | boolean;
    workflow?: Prisma.XOR<Prisma.WorkflowScalarRelationFilter, Prisma.WorkflowWhereInput>;
};
export type WebhookRouteOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    method?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    workflow?: Prisma.WorkflowOrderByWithRelationInput;
};
export type WebhookRouteWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    path?: string;
    AND?: Prisma.WebhookRouteWhereInput | Prisma.WebhookRouteWhereInput[];
    OR?: Prisma.WebhookRouteWhereInput[];
    NOT?: Prisma.WebhookRouteWhereInput | Prisma.WebhookRouteWhereInput[];
    workflowId?: Prisma.StringFilter<"WebhookRoute"> | string;
    nodeId?: Prisma.StringFilter<"WebhookRoute"> | string;
    method?: Prisma.StringFilter<"WebhookRoute"> | string;
    active?: Prisma.BoolFilter<"WebhookRoute"> | boolean;
    workflow?: Prisma.XOR<Prisma.WorkflowScalarRelationFilter, Prisma.WorkflowWhereInput>;
}, "id" | "path">;
export type WebhookRouteOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    method?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
    _count?: Prisma.WebhookRouteCountOrderByAggregateInput;
    _max?: Prisma.WebhookRouteMaxOrderByAggregateInput;
    _min?: Prisma.WebhookRouteMinOrderByAggregateInput;
};
export type WebhookRouteScalarWhereWithAggregatesInput = {
    AND?: Prisma.WebhookRouteScalarWhereWithAggregatesInput | Prisma.WebhookRouteScalarWhereWithAggregatesInput[];
    OR?: Prisma.WebhookRouteScalarWhereWithAggregatesInput[];
    NOT?: Prisma.WebhookRouteScalarWhereWithAggregatesInput | Prisma.WebhookRouteScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"WebhookRoute"> | string;
    path?: Prisma.StringWithAggregatesFilter<"WebhookRoute"> | string;
    workflowId?: Prisma.StringWithAggregatesFilter<"WebhookRoute"> | string;
    nodeId?: Prisma.StringWithAggregatesFilter<"WebhookRoute"> | string;
    method?: Prisma.StringWithAggregatesFilter<"WebhookRoute"> | string;
    active?: Prisma.BoolWithAggregatesFilter<"WebhookRoute"> | boolean;
};
export type WebhookRouteCreateInput = {
    id?: string;
    path: string;
    nodeId: string;
    method?: string;
    active?: boolean;
    workflow: Prisma.WorkflowCreateNestedOneWithoutWebhookRoutesInput;
};
export type WebhookRouteUncheckedCreateInput = {
    id?: string;
    path: string;
    workflowId: string;
    nodeId: string;
    method?: string;
    active?: boolean;
};
export type WebhookRouteUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    method?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    workflow?: Prisma.WorkflowUpdateOneRequiredWithoutWebhookRoutesNestedInput;
};
export type WebhookRouteUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    workflowId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    method?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type WebhookRouteCreateManyInput = {
    id?: string;
    path: string;
    workflowId: string;
    nodeId: string;
    method?: string;
    active?: boolean;
};
export type WebhookRouteUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    method?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type WebhookRouteUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    workflowId?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    method?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type WebhookRouteListRelationFilter = {
    every?: Prisma.WebhookRouteWhereInput;
    some?: Prisma.WebhookRouteWhereInput;
    none?: Prisma.WebhookRouteWhereInput;
};
export type WebhookRouteOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type WebhookRouteCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    method?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
};
export type WebhookRouteMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    method?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
};
export type WebhookRouteMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    path?: Prisma.SortOrder;
    workflowId?: Prisma.SortOrder;
    nodeId?: Prisma.SortOrder;
    method?: Prisma.SortOrder;
    active?: Prisma.SortOrder;
};
export type WebhookRouteCreateNestedManyWithoutWorkflowInput = {
    create?: Prisma.XOR<Prisma.WebhookRouteCreateWithoutWorkflowInput, Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput> | Prisma.WebhookRouteCreateWithoutWorkflowInput[] | Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.WebhookRouteCreateOrConnectWithoutWorkflowInput | Prisma.WebhookRouteCreateOrConnectWithoutWorkflowInput[];
    createMany?: Prisma.WebhookRouteCreateManyWorkflowInputEnvelope;
    connect?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
};
export type WebhookRouteUncheckedCreateNestedManyWithoutWorkflowInput = {
    create?: Prisma.XOR<Prisma.WebhookRouteCreateWithoutWorkflowInput, Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput> | Prisma.WebhookRouteCreateWithoutWorkflowInput[] | Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.WebhookRouteCreateOrConnectWithoutWorkflowInput | Prisma.WebhookRouteCreateOrConnectWithoutWorkflowInput[];
    createMany?: Prisma.WebhookRouteCreateManyWorkflowInputEnvelope;
    connect?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
};
export type WebhookRouteUpdateManyWithoutWorkflowNestedInput = {
    create?: Prisma.XOR<Prisma.WebhookRouteCreateWithoutWorkflowInput, Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput> | Prisma.WebhookRouteCreateWithoutWorkflowInput[] | Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.WebhookRouteCreateOrConnectWithoutWorkflowInput | Prisma.WebhookRouteCreateOrConnectWithoutWorkflowInput[];
    upsert?: Prisma.WebhookRouteUpsertWithWhereUniqueWithoutWorkflowInput | Prisma.WebhookRouteUpsertWithWhereUniqueWithoutWorkflowInput[];
    createMany?: Prisma.WebhookRouteCreateManyWorkflowInputEnvelope;
    set?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
    disconnect?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
    delete?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
    connect?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
    update?: Prisma.WebhookRouteUpdateWithWhereUniqueWithoutWorkflowInput | Prisma.WebhookRouteUpdateWithWhereUniqueWithoutWorkflowInput[];
    updateMany?: Prisma.WebhookRouteUpdateManyWithWhereWithoutWorkflowInput | Prisma.WebhookRouteUpdateManyWithWhereWithoutWorkflowInput[];
    deleteMany?: Prisma.WebhookRouteScalarWhereInput | Prisma.WebhookRouteScalarWhereInput[];
};
export type WebhookRouteUncheckedUpdateManyWithoutWorkflowNestedInput = {
    create?: Prisma.XOR<Prisma.WebhookRouteCreateWithoutWorkflowInput, Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput> | Prisma.WebhookRouteCreateWithoutWorkflowInput[] | Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput[];
    connectOrCreate?: Prisma.WebhookRouteCreateOrConnectWithoutWorkflowInput | Prisma.WebhookRouteCreateOrConnectWithoutWorkflowInput[];
    upsert?: Prisma.WebhookRouteUpsertWithWhereUniqueWithoutWorkflowInput | Prisma.WebhookRouteUpsertWithWhereUniqueWithoutWorkflowInput[];
    createMany?: Prisma.WebhookRouteCreateManyWorkflowInputEnvelope;
    set?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
    disconnect?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
    delete?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
    connect?: Prisma.WebhookRouteWhereUniqueInput | Prisma.WebhookRouteWhereUniqueInput[];
    update?: Prisma.WebhookRouteUpdateWithWhereUniqueWithoutWorkflowInput | Prisma.WebhookRouteUpdateWithWhereUniqueWithoutWorkflowInput[];
    updateMany?: Prisma.WebhookRouteUpdateManyWithWhereWithoutWorkflowInput | Prisma.WebhookRouteUpdateManyWithWhereWithoutWorkflowInput[];
    deleteMany?: Prisma.WebhookRouteScalarWhereInput | Prisma.WebhookRouteScalarWhereInput[];
};
export type WebhookRouteCreateWithoutWorkflowInput = {
    id?: string;
    path: string;
    nodeId: string;
    method?: string;
    active?: boolean;
};
export type WebhookRouteUncheckedCreateWithoutWorkflowInput = {
    id?: string;
    path: string;
    nodeId: string;
    method?: string;
    active?: boolean;
};
export type WebhookRouteCreateOrConnectWithoutWorkflowInput = {
    where: Prisma.WebhookRouteWhereUniqueInput;
    create: Prisma.XOR<Prisma.WebhookRouteCreateWithoutWorkflowInput, Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput>;
};
export type WebhookRouteCreateManyWorkflowInputEnvelope = {
    data: Prisma.WebhookRouteCreateManyWorkflowInput | Prisma.WebhookRouteCreateManyWorkflowInput[];
    skipDuplicates?: boolean;
};
export type WebhookRouteUpsertWithWhereUniqueWithoutWorkflowInput = {
    where: Prisma.WebhookRouteWhereUniqueInput;
    update: Prisma.XOR<Prisma.WebhookRouteUpdateWithoutWorkflowInput, Prisma.WebhookRouteUncheckedUpdateWithoutWorkflowInput>;
    create: Prisma.XOR<Prisma.WebhookRouteCreateWithoutWorkflowInput, Prisma.WebhookRouteUncheckedCreateWithoutWorkflowInput>;
};
export type WebhookRouteUpdateWithWhereUniqueWithoutWorkflowInput = {
    where: Prisma.WebhookRouteWhereUniqueInput;
    data: Prisma.XOR<Prisma.WebhookRouteUpdateWithoutWorkflowInput, Prisma.WebhookRouteUncheckedUpdateWithoutWorkflowInput>;
};
export type WebhookRouteUpdateManyWithWhereWithoutWorkflowInput = {
    where: Prisma.WebhookRouteScalarWhereInput;
    data: Prisma.XOR<Prisma.WebhookRouteUpdateManyMutationInput, Prisma.WebhookRouteUncheckedUpdateManyWithoutWorkflowInput>;
};
export type WebhookRouteScalarWhereInput = {
    AND?: Prisma.WebhookRouteScalarWhereInput | Prisma.WebhookRouteScalarWhereInput[];
    OR?: Prisma.WebhookRouteScalarWhereInput[];
    NOT?: Prisma.WebhookRouteScalarWhereInput | Prisma.WebhookRouteScalarWhereInput[];
    id?: Prisma.StringFilter<"WebhookRoute"> | string;
    path?: Prisma.StringFilter<"WebhookRoute"> | string;
    workflowId?: Prisma.StringFilter<"WebhookRoute"> | string;
    nodeId?: Prisma.StringFilter<"WebhookRoute"> | string;
    method?: Prisma.StringFilter<"WebhookRoute"> | string;
    active?: Prisma.BoolFilter<"WebhookRoute"> | boolean;
};
export type WebhookRouteCreateManyWorkflowInput = {
    id?: string;
    path: string;
    nodeId: string;
    method?: string;
    active?: boolean;
};
export type WebhookRouteUpdateWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    method?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type WebhookRouteUncheckedUpdateWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    method?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type WebhookRouteUncheckedUpdateManyWithoutWorkflowInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    path?: Prisma.StringFieldUpdateOperationsInput | string;
    nodeId?: Prisma.StringFieldUpdateOperationsInput | string;
    method?: Prisma.StringFieldUpdateOperationsInput | string;
    active?: Prisma.BoolFieldUpdateOperationsInput | boolean;
};
export type WebhookRouteSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    path?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    method?: boolean;
    active?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["webhookRoute"]>;
export type WebhookRouteSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    path?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    method?: boolean;
    active?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["webhookRoute"]>;
export type WebhookRouteSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    path?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    method?: boolean;
    active?: boolean;
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["webhookRoute"]>;
export type WebhookRouteSelectScalar = {
    id?: boolean;
    path?: boolean;
    workflowId?: boolean;
    nodeId?: boolean;
    method?: boolean;
    active?: boolean;
};
export type WebhookRouteOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "path" | "workflowId" | "nodeId" | "method" | "active", ExtArgs["result"]["webhookRoute"]>;
export type WebhookRouteInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type WebhookRouteIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type WebhookRouteIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    workflow?: boolean | Prisma.WorkflowDefaultArgs<ExtArgs>;
};
export type $WebhookRoutePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "WebhookRoute";
    objects: {
        workflow: Prisma.$WorkflowPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        path: string;
        workflowId: string;
        nodeId: string;
        method: string;
        active: boolean;
    }, ExtArgs["result"]["webhookRoute"]>;
    composites: {};
};
export type WebhookRouteGetPayload<S extends boolean | null | undefined | WebhookRouteDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload, S>;
export type WebhookRouteCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<WebhookRouteFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: WebhookRouteCountAggregateInputType | true;
};
export interface WebhookRouteDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['WebhookRoute'];
        meta: {
            name: 'WebhookRoute';
        };
    };
    /**
     * Find zero or one WebhookRoute that matches the filter.
     * @param {WebhookRouteFindUniqueArgs} args - Arguments to find a WebhookRoute
     * @example
     * // Get one WebhookRoute
     * const webhookRoute = await prisma.webhookRoute.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WebhookRouteFindUniqueArgs>(args: Prisma.SelectSubset<T, WebhookRouteFindUniqueArgs<ExtArgs>>): Prisma.Prisma__WebhookRouteClient<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one WebhookRoute that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WebhookRouteFindUniqueOrThrowArgs} args - Arguments to find a WebhookRoute
     * @example
     * // Get one WebhookRoute
     * const webhookRoute = await prisma.webhookRoute.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WebhookRouteFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, WebhookRouteFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__WebhookRouteClient<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first WebhookRoute that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookRouteFindFirstArgs} args - Arguments to find a WebhookRoute
     * @example
     * // Get one WebhookRoute
     * const webhookRoute = await prisma.webhookRoute.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WebhookRouteFindFirstArgs>(args?: Prisma.SelectSubset<T, WebhookRouteFindFirstArgs<ExtArgs>>): Prisma.Prisma__WebhookRouteClient<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first WebhookRoute that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookRouteFindFirstOrThrowArgs} args - Arguments to find a WebhookRoute
     * @example
     * // Get one WebhookRoute
     * const webhookRoute = await prisma.webhookRoute.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WebhookRouteFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, WebhookRouteFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__WebhookRouteClient<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more WebhookRoutes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookRouteFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all WebhookRoutes
     * const webhookRoutes = await prisma.webhookRoute.findMany()
     *
     * // Get first 10 WebhookRoutes
     * const webhookRoutes = await prisma.webhookRoute.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const webhookRouteWithIdOnly = await prisma.webhookRoute.findMany({ select: { id: true } })
     *
     */
    findMany<T extends WebhookRouteFindManyArgs>(args?: Prisma.SelectSubset<T, WebhookRouteFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a WebhookRoute.
     * @param {WebhookRouteCreateArgs} args - Arguments to create a WebhookRoute.
     * @example
     * // Create one WebhookRoute
     * const WebhookRoute = await prisma.webhookRoute.create({
     *   data: {
     *     // ... data to create a WebhookRoute
     *   }
     * })
     *
     */
    create<T extends WebhookRouteCreateArgs>(args: Prisma.SelectSubset<T, WebhookRouteCreateArgs<ExtArgs>>): Prisma.Prisma__WebhookRouteClient<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many WebhookRoutes.
     * @param {WebhookRouteCreateManyArgs} args - Arguments to create many WebhookRoutes.
     * @example
     * // Create many WebhookRoutes
     * const webhookRoute = await prisma.webhookRoute.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends WebhookRouteCreateManyArgs>(args?: Prisma.SelectSubset<T, WebhookRouteCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many WebhookRoutes and returns the data saved in the database.
     * @param {WebhookRouteCreateManyAndReturnArgs} args - Arguments to create many WebhookRoutes.
     * @example
     * // Create many WebhookRoutes
     * const webhookRoute = await prisma.webhookRoute.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many WebhookRoutes and only return the `id`
     * const webhookRouteWithIdOnly = await prisma.webhookRoute.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends WebhookRouteCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, WebhookRouteCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a WebhookRoute.
     * @param {WebhookRouteDeleteArgs} args - Arguments to delete one WebhookRoute.
     * @example
     * // Delete one WebhookRoute
     * const WebhookRoute = await prisma.webhookRoute.delete({
     *   where: {
     *     // ... filter to delete one WebhookRoute
     *   }
     * })
     *
     */
    delete<T extends WebhookRouteDeleteArgs>(args: Prisma.SelectSubset<T, WebhookRouteDeleteArgs<ExtArgs>>): Prisma.Prisma__WebhookRouteClient<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one WebhookRoute.
     * @param {WebhookRouteUpdateArgs} args - Arguments to update one WebhookRoute.
     * @example
     * // Update one WebhookRoute
     * const webhookRoute = await prisma.webhookRoute.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends WebhookRouteUpdateArgs>(args: Prisma.SelectSubset<T, WebhookRouteUpdateArgs<ExtArgs>>): Prisma.Prisma__WebhookRouteClient<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more WebhookRoutes.
     * @param {WebhookRouteDeleteManyArgs} args - Arguments to filter WebhookRoutes to delete.
     * @example
     * // Delete a few WebhookRoutes
     * const { count } = await prisma.webhookRoute.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends WebhookRouteDeleteManyArgs>(args?: Prisma.SelectSubset<T, WebhookRouteDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more WebhookRoutes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookRouteUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many WebhookRoutes
     * const webhookRoute = await prisma.webhookRoute.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends WebhookRouteUpdateManyArgs>(args: Prisma.SelectSubset<T, WebhookRouteUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more WebhookRoutes and returns the data updated in the database.
     * @param {WebhookRouteUpdateManyAndReturnArgs} args - Arguments to update many WebhookRoutes.
     * @example
     * // Update many WebhookRoutes
     * const webhookRoute = await prisma.webhookRoute.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more WebhookRoutes and only return the `id`
     * const webhookRouteWithIdOnly = await prisma.webhookRoute.updateManyAndReturn({
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
    updateManyAndReturn<T extends WebhookRouteUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, WebhookRouteUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one WebhookRoute.
     * @param {WebhookRouteUpsertArgs} args - Arguments to update or create a WebhookRoute.
     * @example
     * // Update or create a WebhookRoute
     * const webhookRoute = await prisma.webhookRoute.upsert({
     *   create: {
     *     // ... data to create a WebhookRoute
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the WebhookRoute we want to update
     *   }
     * })
     */
    upsert<T extends WebhookRouteUpsertArgs>(args: Prisma.SelectSubset<T, WebhookRouteUpsertArgs<ExtArgs>>): Prisma.Prisma__WebhookRouteClient<runtime.Types.Result.GetResult<Prisma.$WebhookRoutePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of WebhookRoutes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookRouteCountArgs} args - Arguments to filter WebhookRoutes to count.
     * @example
     * // Count the number of WebhookRoutes
     * const count = await prisma.webhookRoute.count({
     *   where: {
     *     // ... the filter for the WebhookRoutes we want to count
     *   }
     * })
    **/
    count<T extends WebhookRouteCountArgs>(args?: Prisma.Subset<T, WebhookRouteCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], WebhookRouteCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a WebhookRoute.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookRouteAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends WebhookRouteAggregateArgs>(args: Prisma.Subset<T, WebhookRouteAggregateArgs>): Prisma.PrismaPromise<GetWebhookRouteAggregateType<T>>;
    /**
     * Group by WebhookRoute.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookRouteGroupByArgs} args - Group by arguments.
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
    groupBy<T extends WebhookRouteGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: WebhookRouteGroupByArgs['orderBy'];
    } : {
        orderBy?: WebhookRouteGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, WebhookRouteGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWebhookRouteGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the WebhookRoute model
     */
    readonly fields: WebhookRouteFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for WebhookRoute.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__WebhookRouteClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
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
 * Fields of the WebhookRoute model
 */
export interface WebhookRouteFieldRefs {
    readonly id: Prisma.FieldRef<"WebhookRoute", 'String'>;
    readonly path: Prisma.FieldRef<"WebhookRoute", 'String'>;
    readonly workflowId: Prisma.FieldRef<"WebhookRoute", 'String'>;
    readonly nodeId: Prisma.FieldRef<"WebhookRoute", 'String'>;
    readonly method: Prisma.FieldRef<"WebhookRoute", 'String'>;
    readonly active: Prisma.FieldRef<"WebhookRoute", 'Boolean'>;
}
/**
 * WebhookRoute findUnique
 */
export type WebhookRouteFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which WebhookRoute to fetch.
     */
    where: Prisma.WebhookRouteWhereUniqueInput;
};
/**
 * WebhookRoute findUniqueOrThrow
 */
export type WebhookRouteFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which WebhookRoute to fetch.
     */
    where: Prisma.WebhookRouteWhereUniqueInput;
};
/**
 * WebhookRoute findFirst
 */
export type WebhookRouteFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which WebhookRoute to fetch.
     */
    where?: Prisma.WebhookRouteWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of WebhookRoutes to fetch.
     */
    orderBy?: Prisma.WebhookRouteOrderByWithRelationInput | Prisma.WebhookRouteOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for WebhookRoutes.
     */
    cursor?: Prisma.WebhookRouteWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` WebhookRoutes from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` WebhookRoutes.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of WebhookRoutes.
     */
    distinct?: Prisma.WebhookRouteScalarFieldEnum | Prisma.WebhookRouteScalarFieldEnum[];
};
/**
 * WebhookRoute findFirstOrThrow
 */
export type WebhookRouteFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which WebhookRoute to fetch.
     */
    where?: Prisma.WebhookRouteWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of WebhookRoutes to fetch.
     */
    orderBy?: Prisma.WebhookRouteOrderByWithRelationInput | Prisma.WebhookRouteOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for WebhookRoutes.
     */
    cursor?: Prisma.WebhookRouteWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` WebhookRoutes from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` WebhookRoutes.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of WebhookRoutes.
     */
    distinct?: Prisma.WebhookRouteScalarFieldEnum | Prisma.WebhookRouteScalarFieldEnum[];
};
/**
 * WebhookRoute findMany
 */
export type WebhookRouteFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which WebhookRoutes to fetch.
     */
    where?: Prisma.WebhookRouteWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of WebhookRoutes to fetch.
     */
    orderBy?: Prisma.WebhookRouteOrderByWithRelationInput | Prisma.WebhookRouteOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing WebhookRoutes.
     */
    cursor?: Prisma.WebhookRouteWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` WebhookRoutes from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` WebhookRoutes.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of WebhookRoutes.
     */
    distinct?: Prisma.WebhookRouteScalarFieldEnum | Prisma.WebhookRouteScalarFieldEnum[];
};
/**
 * WebhookRoute create
 */
export type WebhookRouteCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a WebhookRoute.
     */
    data: Prisma.XOR<Prisma.WebhookRouteCreateInput, Prisma.WebhookRouteUncheckedCreateInput>;
};
/**
 * WebhookRoute createMany
 */
export type WebhookRouteCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many WebhookRoutes.
     */
    data: Prisma.WebhookRouteCreateManyInput | Prisma.WebhookRouteCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * WebhookRoute createManyAndReturn
 */
export type WebhookRouteCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WebhookRoute
     */
    select?: Prisma.WebhookRouteSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the WebhookRoute
     */
    omit?: Prisma.WebhookRouteOmit<ExtArgs> | null;
    /**
     * The data used to create many WebhookRoutes.
     */
    data: Prisma.WebhookRouteCreateManyInput | Prisma.WebhookRouteCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WebhookRouteIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * WebhookRoute update
 */
export type WebhookRouteUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a WebhookRoute.
     */
    data: Prisma.XOR<Prisma.WebhookRouteUpdateInput, Prisma.WebhookRouteUncheckedUpdateInput>;
    /**
     * Choose, which WebhookRoute to update.
     */
    where: Prisma.WebhookRouteWhereUniqueInput;
};
/**
 * WebhookRoute updateMany
 */
export type WebhookRouteUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update WebhookRoutes.
     */
    data: Prisma.XOR<Prisma.WebhookRouteUpdateManyMutationInput, Prisma.WebhookRouteUncheckedUpdateManyInput>;
    /**
     * Filter which WebhookRoutes to update
     */
    where?: Prisma.WebhookRouteWhereInput;
    /**
     * Limit how many WebhookRoutes to update.
     */
    limit?: number;
};
/**
 * WebhookRoute updateManyAndReturn
 */
export type WebhookRouteUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WebhookRoute
     */
    select?: Prisma.WebhookRouteSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the WebhookRoute
     */
    omit?: Prisma.WebhookRouteOmit<ExtArgs> | null;
    /**
     * The data used to update WebhookRoutes.
     */
    data: Prisma.XOR<Prisma.WebhookRouteUpdateManyMutationInput, Prisma.WebhookRouteUncheckedUpdateManyInput>;
    /**
     * Filter which WebhookRoutes to update
     */
    where?: Prisma.WebhookRouteWhereInput;
    /**
     * Limit how many WebhookRoutes to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.WebhookRouteIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * WebhookRoute upsert
 */
export type WebhookRouteUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the WebhookRoute to update in case it exists.
     */
    where: Prisma.WebhookRouteWhereUniqueInput;
    /**
     * In case the WebhookRoute found by the `where` argument doesn't exist, create a new WebhookRoute with this data.
     */
    create: Prisma.XOR<Prisma.WebhookRouteCreateInput, Prisma.WebhookRouteUncheckedCreateInput>;
    /**
     * In case the WebhookRoute was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.WebhookRouteUpdateInput, Prisma.WebhookRouteUncheckedUpdateInput>;
};
/**
 * WebhookRoute delete
 */
export type WebhookRouteDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which WebhookRoute to delete.
     */
    where: Prisma.WebhookRouteWhereUniqueInput;
};
/**
 * WebhookRoute deleteMany
 */
export type WebhookRouteDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which WebhookRoutes to delete
     */
    where?: Prisma.WebhookRouteWhereInput;
    /**
     * Limit how many WebhookRoutes to delete.
     */
    limit?: number;
};
/**
 * WebhookRoute without action
 */
export type WebhookRouteDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
