import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model WorkflowTemplate
 * Community templates synced from scraped public n8n.io workflows.
 */
export type WorkflowTemplateModel = runtime.Types.Result.DefaultSelection<Prisma.$WorkflowTemplatePayload>;
export type AggregateWorkflowTemplate = {
    _count: WorkflowTemplateCountAggregateOutputType | null;
    _avg: WorkflowTemplateAvgAggregateOutputType | null;
    _sum: WorkflowTemplateSumAggregateOutputType | null;
    _min: WorkflowTemplateMinAggregateOutputType | null;
    _max: WorkflowTemplateMaxAggregateOutputType | null;
};
export type WorkflowTemplateAvgAggregateOutputType = {
    externalId: number | null;
    views: number | null;
    recentViews: number | null;
    nodeCount: number | null;
};
export type WorkflowTemplateSumAggregateOutputType = {
    externalId: number | null;
    views: number | null;
    recentViews: number | null;
    nodeCount: number | null;
};
export type WorkflowTemplateMinAggregateOutputType = {
    id: string | null;
    externalId: number | null;
    name: string | null;
    description: string | null;
    imageUrl: string | null;
    views: number | null;
    recentViews: number | null;
    nodeCount: number | null;
    nodeTypes: string | null;
    categories: string | null;
    authorName: string | null;
    authorUsername: string | null;
    authorAvatar: string | null;
    workflowJson: string | null;
    metaJson: string | null;
    sourceUrl: string | null;
    readyToDemo: boolean | null;
    publishedAt: Date | null;
    syncedAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type WorkflowTemplateMaxAggregateOutputType = {
    id: string | null;
    externalId: number | null;
    name: string | null;
    description: string | null;
    imageUrl: string | null;
    views: number | null;
    recentViews: number | null;
    nodeCount: number | null;
    nodeTypes: string | null;
    categories: string | null;
    authorName: string | null;
    authorUsername: string | null;
    authorAvatar: string | null;
    workflowJson: string | null;
    metaJson: string | null;
    sourceUrl: string | null;
    readyToDemo: boolean | null;
    publishedAt: Date | null;
    syncedAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type WorkflowTemplateCountAggregateOutputType = {
    id: number;
    externalId: number;
    name: number;
    description: number;
    imageUrl: number;
    views: number;
    recentViews: number;
    nodeCount: number;
    nodeTypes: number;
    categories: number;
    authorName: number;
    authorUsername: number;
    authorAvatar: number;
    workflowJson: number;
    metaJson: number;
    sourceUrl: number;
    readyToDemo: number;
    publishedAt: number;
    syncedAt: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type WorkflowTemplateAvgAggregateInputType = {
    externalId?: true;
    views?: true;
    recentViews?: true;
    nodeCount?: true;
};
export type WorkflowTemplateSumAggregateInputType = {
    externalId?: true;
    views?: true;
    recentViews?: true;
    nodeCount?: true;
};
export type WorkflowTemplateMinAggregateInputType = {
    id?: true;
    externalId?: true;
    name?: true;
    description?: true;
    imageUrl?: true;
    views?: true;
    recentViews?: true;
    nodeCount?: true;
    nodeTypes?: true;
    categories?: true;
    authorName?: true;
    authorUsername?: true;
    authorAvatar?: true;
    workflowJson?: true;
    metaJson?: true;
    sourceUrl?: true;
    readyToDemo?: true;
    publishedAt?: true;
    syncedAt?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type WorkflowTemplateMaxAggregateInputType = {
    id?: true;
    externalId?: true;
    name?: true;
    description?: true;
    imageUrl?: true;
    views?: true;
    recentViews?: true;
    nodeCount?: true;
    nodeTypes?: true;
    categories?: true;
    authorName?: true;
    authorUsername?: true;
    authorAvatar?: true;
    workflowJson?: true;
    metaJson?: true;
    sourceUrl?: true;
    readyToDemo?: true;
    publishedAt?: true;
    syncedAt?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type WorkflowTemplateCountAggregateInputType = {
    id?: true;
    externalId?: true;
    name?: true;
    description?: true;
    imageUrl?: true;
    views?: true;
    recentViews?: true;
    nodeCount?: true;
    nodeTypes?: true;
    categories?: true;
    authorName?: true;
    authorUsername?: true;
    authorAvatar?: true;
    workflowJson?: true;
    metaJson?: true;
    sourceUrl?: true;
    readyToDemo?: true;
    publishedAt?: true;
    syncedAt?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type WorkflowTemplateAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which WorkflowTemplate to aggregate.
     */
    where?: Prisma.WorkflowTemplateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of WorkflowTemplates to fetch.
     */
    orderBy?: Prisma.WorkflowTemplateOrderByWithRelationInput | Prisma.WorkflowTemplateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.WorkflowTemplateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` WorkflowTemplates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` WorkflowTemplates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned WorkflowTemplates
    **/
    _count?: true | WorkflowTemplateCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: WorkflowTemplateAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: WorkflowTemplateSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: WorkflowTemplateMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: WorkflowTemplateMaxAggregateInputType;
};
export type GetWorkflowTemplateAggregateType<T extends WorkflowTemplateAggregateArgs> = {
    [P in keyof T & keyof AggregateWorkflowTemplate]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateWorkflowTemplate[P]> : Prisma.GetScalarType<T[P], AggregateWorkflowTemplate[P]>;
};
export type WorkflowTemplateGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.WorkflowTemplateWhereInput;
    orderBy?: Prisma.WorkflowTemplateOrderByWithAggregationInput | Prisma.WorkflowTemplateOrderByWithAggregationInput[];
    by: Prisma.WorkflowTemplateScalarFieldEnum[] | Prisma.WorkflowTemplateScalarFieldEnum;
    having?: Prisma.WorkflowTemplateScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: WorkflowTemplateCountAggregateInputType | true;
    _avg?: WorkflowTemplateAvgAggregateInputType;
    _sum?: WorkflowTemplateSumAggregateInputType;
    _min?: WorkflowTemplateMinAggregateInputType;
    _max?: WorkflowTemplateMaxAggregateInputType;
};
export type WorkflowTemplateGroupByOutputType = {
    id: string;
    externalId: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    views: number;
    recentViews: number;
    nodeCount: number;
    nodeTypes: string;
    categories: string;
    authorName: string | null;
    authorUsername: string | null;
    authorAvatar: string | null;
    workflowJson: string;
    metaJson: string | null;
    sourceUrl: string | null;
    readyToDemo: boolean;
    publishedAt: Date | null;
    syncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    _count: WorkflowTemplateCountAggregateOutputType | null;
    _avg: WorkflowTemplateAvgAggregateOutputType | null;
    _sum: WorkflowTemplateSumAggregateOutputType | null;
    _min: WorkflowTemplateMinAggregateOutputType | null;
    _max: WorkflowTemplateMaxAggregateOutputType | null;
};
export type GetWorkflowTemplateGroupByPayload<T extends WorkflowTemplateGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<WorkflowTemplateGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof WorkflowTemplateGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], WorkflowTemplateGroupByOutputType[P]> : Prisma.GetScalarType<T[P], WorkflowTemplateGroupByOutputType[P]>;
}>>;
export type WorkflowTemplateWhereInput = {
    AND?: Prisma.WorkflowTemplateWhereInput | Prisma.WorkflowTemplateWhereInput[];
    OR?: Prisma.WorkflowTemplateWhereInput[];
    NOT?: Prisma.WorkflowTemplateWhereInput | Prisma.WorkflowTemplateWhereInput[];
    id?: Prisma.StringFilter<"WorkflowTemplate"> | string;
    externalId?: Prisma.IntFilter<"WorkflowTemplate"> | number;
    name?: Prisma.StringFilter<"WorkflowTemplate"> | string;
    description?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    imageUrl?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    views?: Prisma.IntFilter<"WorkflowTemplate"> | number;
    recentViews?: Prisma.IntFilter<"WorkflowTemplate"> | number;
    nodeCount?: Prisma.IntFilter<"WorkflowTemplate"> | number;
    nodeTypes?: Prisma.StringFilter<"WorkflowTemplate"> | string;
    categories?: Prisma.StringFilter<"WorkflowTemplate"> | string;
    authorName?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    authorUsername?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    authorAvatar?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    workflowJson?: Prisma.StringFilter<"WorkflowTemplate"> | string;
    metaJson?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    sourceUrl?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    readyToDemo?: Prisma.BoolFilter<"WorkflowTemplate"> | boolean;
    publishedAt?: Prisma.DateTimeNullableFilter<"WorkflowTemplate"> | Date | string | null;
    syncedAt?: Prisma.DateTimeFilter<"WorkflowTemplate"> | Date | string;
    createdAt?: Prisma.DateTimeFilter<"WorkflowTemplate"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"WorkflowTemplate"> | Date | string;
};
export type WorkflowTemplateOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    externalId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    description?: Prisma.SortOrderInput | Prisma.SortOrder;
    imageUrl?: Prisma.SortOrderInput | Prisma.SortOrder;
    views?: Prisma.SortOrder;
    recentViews?: Prisma.SortOrder;
    nodeCount?: Prisma.SortOrder;
    nodeTypes?: Prisma.SortOrder;
    categories?: Prisma.SortOrder;
    authorName?: Prisma.SortOrderInput | Prisma.SortOrder;
    authorUsername?: Prisma.SortOrderInput | Prisma.SortOrder;
    authorAvatar?: Prisma.SortOrderInput | Prisma.SortOrder;
    workflowJson?: Prisma.SortOrder;
    metaJson?: Prisma.SortOrderInput | Prisma.SortOrder;
    sourceUrl?: Prisma.SortOrderInput | Prisma.SortOrder;
    readyToDemo?: Prisma.SortOrder;
    publishedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    syncedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type WorkflowTemplateWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    externalId?: number;
    AND?: Prisma.WorkflowTemplateWhereInput | Prisma.WorkflowTemplateWhereInput[];
    OR?: Prisma.WorkflowTemplateWhereInput[];
    NOT?: Prisma.WorkflowTemplateWhereInput | Prisma.WorkflowTemplateWhereInput[];
    name?: Prisma.StringFilter<"WorkflowTemplate"> | string;
    description?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    imageUrl?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    views?: Prisma.IntFilter<"WorkflowTemplate"> | number;
    recentViews?: Prisma.IntFilter<"WorkflowTemplate"> | number;
    nodeCount?: Prisma.IntFilter<"WorkflowTemplate"> | number;
    nodeTypes?: Prisma.StringFilter<"WorkflowTemplate"> | string;
    categories?: Prisma.StringFilter<"WorkflowTemplate"> | string;
    authorName?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    authorUsername?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    authorAvatar?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    workflowJson?: Prisma.StringFilter<"WorkflowTemplate"> | string;
    metaJson?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    sourceUrl?: Prisma.StringNullableFilter<"WorkflowTemplate"> | string | null;
    readyToDemo?: Prisma.BoolFilter<"WorkflowTemplate"> | boolean;
    publishedAt?: Prisma.DateTimeNullableFilter<"WorkflowTemplate"> | Date | string | null;
    syncedAt?: Prisma.DateTimeFilter<"WorkflowTemplate"> | Date | string;
    createdAt?: Prisma.DateTimeFilter<"WorkflowTemplate"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"WorkflowTemplate"> | Date | string;
}, "id" | "externalId">;
export type WorkflowTemplateOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    externalId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    description?: Prisma.SortOrderInput | Prisma.SortOrder;
    imageUrl?: Prisma.SortOrderInput | Prisma.SortOrder;
    views?: Prisma.SortOrder;
    recentViews?: Prisma.SortOrder;
    nodeCount?: Prisma.SortOrder;
    nodeTypes?: Prisma.SortOrder;
    categories?: Prisma.SortOrder;
    authorName?: Prisma.SortOrderInput | Prisma.SortOrder;
    authorUsername?: Prisma.SortOrderInput | Prisma.SortOrder;
    authorAvatar?: Prisma.SortOrderInput | Prisma.SortOrder;
    workflowJson?: Prisma.SortOrder;
    metaJson?: Prisma.SortOrderInput | Prisma.SortOrder;
    sourceUrl?: Prisma.SortOrderInput | Prisma.SortOrder;
    readyToDemo?: Prisma.SortOrder;
    publishedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    syncedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.WorkflowTemplateCountOrderByAggregateInput;
    _avg?: Prisma.WorkflowTemplateAvgOrderByAggregateInput;
    _max?: Prisma.WorkflowTemplateMaxOrderByAggregateInput;
    _min?: Prisma.WorkflowTemplateMinOrderByAggregateInput;
    _sum?: Prisma.WorkflowTemplateSumOrderByAggregateInput;
};
export type WorkflowTemplateScalarWhereWithAggregatesInput = {
    AND?: Prisma.WorkflowTemplateScalarWhereWithAggregatesInput | Prisma.WorkflowTemplateScalarWhereWithAggregatesInput[];
    OR?: Prisma.WorkflowTemplateScalarWhereWithAggregatesInput[];
    NOT?: Prisma.WorkflowTemplateScalarWhereWithAggregatesInput | Prisma.WorkflowTemplateScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"WorkflowTemplate"> | string;
    externalId?: Prisma.IntWithAggregatesFilter<"WorkflowTemplate"> | number;
    name?: Prisma.StringWithAggregatesFilter<"WorkflowTemplate"> | string;
    description?: Prisma.StringNullableWithAggregatesFilter<"WorkflowTemplate"> | string | null;
    imageUrl?: Prisma.StringNullableWithAggregatesFilter<"WorkflowTemplate"> | string | null;
    views?: Prisma.IntWithAggregatesFilter<"WorkflowTemplate"> | number;
    recentViews?: Prisma.IntWithAggregatesFilter<"WorkflowTemplate"> | number;
    nodeCount?: Prisma.IntWithAggregatesFilter<"WorkflowTemplate"> | number;
    nodeTypes?: Prisma.StringWithAggregatesFilter<"WorkflowTemplate"> | string;
    categories?: Prisma.StringWithAggregatesFilter<"WorkflowTemplate"> | string;
    authorName?: Prisma.StringNullableWithAggregatesFilter<"WorkflowTemplate"> | string | null;
    authorUsername?: Prisma.StringNullableWithAggregatesFilter<"WorkflowTemplate"> | string | null;
    authorAvatar?: Prisma.StringNullableWithAggregatesFilter<"WorkflowTemplate"> | string | null;
    workflowJson?: Prisma.StringWithAggregatesFilter<"WorkflowTemplate"> | string;
    metaJson?: Prisma.StringNullableWithAggregatesFilter<"WorkflowTemplate"> | string | null;
    sourceUrl?: Prisma.StringNullableWithAggregatesFilter<"WorkflowTemplate"> | string | null;
    readyToDemo?: Prisma.BoolWithAggregatesFilter<"WorkflowTemplate"> | boolean;
    publishedAt?: Prisma.DateTimeNullableWithAggregatesFilter<"WorkflowTemplate"> | Date | string | null;
    syncedAt?: Prisma.DateTimeWithAggregatesFilter<"WorkflowTemplate"> | Date | string;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"WorkflowTemplate"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"WorkflowTemplate"> | Date | string;
};
export type WorkflowTemplateCreateInput = {
    id: string;
    externalId: number;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
    views?: number;
    recentViews?: number;
    nodeCount?: number;
    nodeTypes?: string;
    categories?: string;
    authorName?: string | null;
    authorUsername?: string | null;
    authorAvatar?: string | null;
    workflowJson: string;
    metaJson?: string | null;
    sourceUrl?: string | null;
    readyToDemo?: boolean;
    publishedAt?: Date | string | null;
    syncedAt?: Date | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type WorkflowTemplateUncheckedCreateInput = {
    id: string;
    externalId: number;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
    views?: number;
    recentViews?: number;
    nodeCount?: number;
    nodeTypes?: string;
    categories?: string;
    authorName?: string | null;
    authorUsername?: string | null;
    authorAvatar?: string | null;
    workflowJson: string;
    metaJson?: string | null;
    sourceUrl?: string | null;
    readyToDemo?: boolean;
    publishedAt?: Date | string | null;
    syncedAt?: Date | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type WorkflowTemplateUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    externalId?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    imageUrl?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    views?: Prisma.IntFieldUpdateOperationsInput | number;
    recentViews?: Prisma.IntFieldUpdateOperationsInput | number;
    nodeCount?: Prisma.IntFieldUpdateOperationsInput | number;
    nodeTypes?: Prisma.StringFieldUpdateOperationsInput | string;
    categories?: Prisma.StringFieldUpdateOperationsInput | string;
    authorName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    authorUsername?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    authorAvatar?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    workflowJson?: Prisma.StringFieldUpdateOperationsInput | string;
    metaJson?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    sourceUrl?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    readyToDemo?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    publishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    syncedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type WorkflowTemplateUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    externalId?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    imageUrl?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    views?: Prisma.IntFieldUpdateOperationsInput | number;
    recentViews?: Prisma.IntFieldUpdateOperationsInput | number;
    nodeCount?: Prisma.IntFieldUpdateOperationsInput | number;
    nodeTypes?: Prisma.StringFieldUpdateOperationsInput | string;
    categories?: Prisma.StringFieldUpdateOperationsInput | string;
    authorName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    authorUsername?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    authorAvatar?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    workflowJson?: Prisma.StringFieldUpdateOperationsInput | string;
    metaJson?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    sourceUrl?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    readyToDemo?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    publishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    syncedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type WorkflowTemplateCreateManyInput = {
    id: string;
    externalId: number;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
    views?: number;
    recentViews?: number;
    nodeCount?: number;
    nodeTypes?: string;
    categories?: string;
    authorName?: string | null;
    authorUsername?: string | null;
    authorAvatar?: string | null;
    workflowJson: string;
    metaJson?: string | null;
    sourceUrl?: string | null;
    readyToDemo?: boolean;
    publishedAt?: Date | string | null;
    syncedAt?: Date | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type WorkflowTemplateUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    externalId?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    imageUrl?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    views?: Prisma.IntFieldUpdateOperationsInput | number;
    recentViews?: Prisma.IntFieldUpdateOperationsInput | number;
    nodeCount?: Prisma.IntFieldUpdateOperationsInput | number;
    nodeTypes?: Prisma.StringFieldUpdateOperationsInput | string;
    categories?: Prisma.StringFieldUpdateOperationsInput | string;
    authorName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    authorUsername?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    authorAvatar?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    workflowJson?: Prisma.StringFieldUpdateOperationsInput | string;
    metaJson?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    sourceUrl?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    readyToDemo?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    publishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    syncedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type WorkflowTemplateUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    externalId?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    imageUrl?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    views?: Prisma.IntFieldUpdateOperationsInput | number;
    recentViews?: Prisma.IntFieldUpdateOperationsInput | number;
    nodeCount?: Prisma.IntFieldUpdateOperationsInput | number;
    nodeTypes?: Prisma.StringFieldUpdateOperationsInput | string;
    categories?: Prisma.StringFieldUpdateOperationsInput | string;
    authorName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    authorUsername?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    authorAvatar?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    workflowJson?: Prisma.StringFieldUpdateOperationsInput | string;
    metaJson?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    sourceUrl?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    readyToDemo?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    publishedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    syncedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type WorkflowTemplateCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    externalId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    description?: Prisma.SortOrder;
    imageUrl?: Prisma.SortOrder;
    views?: Prisma.SortOrder;
    recentViews?: Prisma.SortOrder;
    nodeCount?: Prisma.SortOrder;
    nodeTypes?: Prisma.SortOrder;
    categories?: Prisma.SortOrder;
    authorName?: Prisma.SortOrder;
    authorUsername?: Prisma.SortOrder;
    authorAvatar?: Prisma.SortOrder;
    workflowJson?: Prisma.SortOrder;
    metaJson?: Prisma.SortOrder;
    sourceUrl?: Prisma.SortOrder;
    readyToDemo?: Prisma.SortOrder;
    publishedAt?: Prisma.SortOrder;
    syncedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type WorkflowTemplateAvgOrderByAggregateInput = {
    externalId?: Prisma.SortOrder;
    views?: Prisma.SortOrder;
    recentViews?: Prisma.SortOrder;
    nodeCount?: Prisma.SortOrder;
};
export type WorkflowTemplateMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    externalId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    description?: Prisma.SortOrder;
    imageUrl?: Prisma.SortOrder;
    views?: Prisma.SortOrder;
    recentViews?: Prisma.SortOrder;
    nodeCount?: Prisma.SortOrder;
    nodeTypes?: Prisma.SortOrder;
    categories?: Prisma.SortOrder;
    authorName?: Prisma.SortOrder;
    authorUsername?: Prisma.SortOrder;
    authorAvatar?: Prisma.SortOrder;
    workflowJson?: Prisma.SortOrder;
    metaJson?: Prisma.SortOrder;
    sourceUrl?: Prisma.SortOrder;
    readyToDemo?: Prisma.SortOrder;
    publishedAt?: Prisma.SortOrder;
    syncedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type WorkflowTemplateMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    externalId?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    description?: Prisma.SortOrder;
    imageUrl?: Prisma.SortOrder;
    views?: Prisma.SortOrder;
    recentViews?: Prisma.SortOrder;
    nodeCount?: Prisma.SortOrder;
    nodeTypes?: Prisma.SortOrder;
    categories?: Prisma.SortOrder;
    authorName?: Prisma.SortOrder;
    authorUsername?: Prisma.SortOrder;
    authorAvatar?: Prisma.SortOrder;
    workflowJson?: Prisma.SortOrder;
    metaJson?: Prisma.SortOrder;
    sourceUrl?: Prisma.SortOrder;
    readyToDemo?: Prisma.SortOrder;
    publishedAt?: Prisma.SortOrder;
    syncedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type WorkflowTemplateSumOrderByAggregateInput = {
    externalId?: Prisma.SortOrder;
    views?: Prisma.SortOrder;
    recentViews?: Prisma.SortOrder;
    nodeCount?: Prisma.SortOrder;
};
export type WorkflowTemplateSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    externalId?: boolean;
    name?: boolean;
    description?: boolean;
    imageUrl?: boolean;
    views?: boolean;
    recentViews?: boolean;
    nodeCount?: boolean;
    nodeTypes?: boolean;
    categories?: boolean;
    authorName?: boolean;
    authorUsername?: boolean;
    authorAvatar?: boolean;
    workflowJson?: boolean;
    metaJson?: boolean;
    sourceUrl?: boolean;
    readyToDemo?: boolean;
    publishedAt?: boolean;
    syncedAt?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["workflowTemplate"]>;
export type WorkflowTemplateSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    externalId?: boolean;
    name?: boolean;
    description?: boolean;
    imageUrl?: boolean;
    views?: boolean;
    recentViews?: boolean;
    nodeCount?: boolean;
    nodeTypes?: boolean;
    categories?: boolean;
    authorName?: boolean;
    authorUsername?: boolean;
    authorAvatar?: boolean;
    workflowJson?: boolean;
    metaJson?: boolean;
    sourceUrl?: boolean;
    readyToDemo?: boolean;
    publishedAt?: boolean;
    syncedAt?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["workflowTemplate"]>;
export type WorkflowTemplateSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    externalId?: boolean;
    name?: boolean;
    description?: boolean;
    imageUrl?: boolean;
    views?: boolean;
    recentViews?: boolean;
    nodeCount?: boolean;
    nodeTypes?: boolean;
    categories?: boolean;
    authorName?: boolean;
    authorUsername?: boolean;
    authorAvatar?: boolean;
    workflowJson?: boolean;
    metaJson?: boolean;
    sourceUrl?: boolean;
    readyToDemo?: boolean;
    publishedAt?: boolean;
    syncedAt?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["workflowTemplate"]>;
export type WorkflowTemplateSelectScalar = {
    id?: boolean;
    externalId?: boolean;
    name?: boolean;
    description?: boolean;
    imageUrl?: boolean;
    views?: boolean;
    recentViews?: boolean;
    nodeCount?: boolean;
    nodeTypes?: boolean;
    categories?: boolean;
    authorName?: boolean;
    authorUsername?: boolean;
    authorAvatar?: boolean;
    workflowJson?: boolean;
    metaJson?: boolean;
    sourceUrl?: boolean;
    readyToDemo?: boolean;
    publishedAt?: boolean;
    syncedAt?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type WorkflowTemplateOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "externalId" | "name" | "description" | "imageUrl" | "views" | "recentViews" | "nodeCount" | "nodeTypes" | "categories" | "authorName" | "authorUsername" | "authorAvatar" | "workflowJson" | "metaJson" | "sourceUrl" | "readyToDemo" | "publishedAt" | "syncedAt" | "createdAt" | "updatedAt", ExtArgs["result"]["workflowTemplate"]>;
export type $WorkflowTemplatePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "WorkflowTemplate";
    objects: {};
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        externalId: number;
        name: string;
        description: string | null;
        imageUrl: string | null;
        views: number;
        recentViews: number;
        nodeCount: number;
        /**
         * JSON string[] of n8n node type names
         */
        nodeTypes: string;
        /**
         * JSON string[] category names
         */
        categories: string;
        authorName: string | null;
        authorUsername: string | null;
        authorAvatar: string | null;
        /**
         * Full workflow graph JSON (nodes + connections + …)
         */
        workflowJson: string;
        metaJson: string | null;
        sourceUrl: string | null;
        readyToDemo: boolean;
        publishedAt: Date | null;
        syncedAt: Date;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["workflowTemplate"]>;
    composites: {};
};
export type WorkflowTemplateGetPayload<S extends boolean | null | undefined | WorkflowTemplateDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload, S>;
export type WorkflowTemplateCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<WorkflowTemplateFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: WorkflowTemplateCountAggregateInputType | true;
};
export interface WorkflowTemplateDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['WorkflowTemplate'];
        meta: {
            name: 'WorkflowTemplate';
        };
    };
    /**
     * Find zero or one WorkflowTemplate that matches the filter.
     * @param {WorkflowTemplateFindUniqueArgs} args - Arguments to find a WorkflowTemplate
     * @example
     * // Get one WorkflowTemplate
     * const workflowTemplate = await prisma.workflowTemplate.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkflowTemplateFindUniqueArgs>(args: Prisma.SelectSubset<T, WorkflowTemplateFindUniqueArgs<ExtArgs>>): Prisma.Prisma__WorkflowTemplateClient<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one WorkflowTemplate that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkflowTemplateFindUniqueOrThrowArgs} args - Arguments to find a WorkflowTemplate
     * @example
     * // Get one WorkflowTemplate
     * const workflowTemplate = await prisma.workflowTemplate.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkflowTemplateFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, WorkflowTemplateFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__WorkflowTemplateClient<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first WorkflowTemplate that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowTemplateFindFirstArgs} args - Arguments to find a WorkflowTemplate
     * @example
     * // Get one WorkflowTemplate
     * const workflowTemplate = await prisma.workflowTemplate.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkflowTemplateFindFirstArgs>(args?: Prisma.SelectSubset<T, WorkflowTemplateFindFirstArgs<ExtArgs>>): Prisma.Prisma__WorkflowTemplateClient<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first WorkflowTemplate that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowTemplateFindFirstOrThrowArgs} args - Arguments to find a WorkflowTemplate
     * @example
     * // Get one WorkflowTemplate
     * const workflowTemplate = await prisma.workflowTemplate.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkflowTemplateFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, WorkflowTemplateFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__WorkflowTemplateClient<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more WorkflowTemplates that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowTemplateFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all WorkflowTemplates
     * const workflowTemplates = await prisma.workflowTemplate.findMany()
     *
     * // Get first 10 WorkflowTemplates
     * const workflowTemplates = await prisma.workflowTemplate.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const workflowTemplateWithIdOnly = await prisma.workflowTemplate.findMany({ select: { id: true } })
     *
     */
    findMany<T extends WorkflowTemplateFindManyArgs>(args?: Prisma.SelectSubset<T, WorkflowTemplateFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a WorkflowTemplate.
     * @param {WorkflowTemplateCreateArgs} args - Arguments to create a WorkflowTemplate.
     * @example
     * // Create one WorkflowTemplate
     * const WorkflowTemplate = await prisma.workflowTemplate.create({
     *   data: {
     *     // ... data to create a WorkflowTemplate
     *   }
     * })
     *
     */
    create<T extends WorkflowTemplateCreateArgs>(args: Prisma.SelectSubset<T, WorkflowTemplateCreateArgs<ExtArgs>>): Prisma.Prisma__WorkflowTemplateClient<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many WorkflowTemplates.
     * @param {WorkflowTemplateCreateManyArgs} args - Arguments to create many WorkflowTemplates.
     * @example
     * // Create many WorkflowTemplates
     * const workflowTemplate = await prisma.workflowTemplate.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends WorkflowTemplateCreateManyArgs>(args?: Prisma.SelectSubset<T, WorkflowTemplateCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many WorkflowTemplates and returns the data saved in the database.
     * @param {WorkflowTemplateCreateManyAndReturnArgs} args - Arguments to create many WorkflowTemplates.
     * @example
     * // Create many WorkflowTemplates
     * const workflowTemplate = await prisma.workflowTemplate.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many WorkflowTemplates and only return the `id`
     * const workflowTemplateWithIdOnly = await prisma.workflowTemplate.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends WorkflowTemplateCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, WorkflowTemplateCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a WorkflowTemplate.
     * @param {WorkflowTemplateDeleteArgs} args - Arguments to delete one WorkflowTemplate.
     * @example
     * // Delete one WorkflowTemplate
     * const WorkflowTemplate = await prisma.workflowTemplate.delete({
     *   where: {
     *     // ... filter to delete one WorkflowTemplate
     *   }
     * })
     *
     */
    delete<T extends WorkflowTemplateDeleteArgs>(args: Prisma.SelectSubset<T, WorkflowTemplateDeleteArgs<ExtArgs>>): Prisma.Prisma__WorkflowTemplateClient<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one WorkflowTemplate.
     * @param {WorkflowTemplateUpdateArgs} args - Arguments to update one WorkflowTemplate.
     * @example
     * // Update one WorkflowTemplate
     * const workflowTemplate = await prisma.workflowTemplate.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends WorkflowTemplateUpdateArgs>(args: Prisma.SelectSubset<T, WorkflowTemplateUpdateArgs<ExtArgs>>): Prisma.Prisma__WorkflowTemplateClient<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more WorkflowTemplates.
     * @param {WorkflowTemplateDeleteManyArgs} args - Arguments to filter WorkflowTemplates to delete.
     * @example
     * // Delete a few WorkflowTemplates
     * const { count } = await prisma.workflowTemplate.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends WorkflowTemplateDeleteManyArgs>(args?: Prisma.SelectSubset<T, WorkflowTemplateDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more WorkflowTemplates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowTemplateUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many WorkflowTemplates
     * const workflowTemplate = await prisma.workflowTemplate.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends WorkflowTemplateUpdateManyArgs>(args: Prisma.SelectSubset<T, WorkflowTemplateUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more WorkflowTemplates and returns the data updated in the database.
     * @param {WorkflowTemplateUpdateManyAndReturnArgs} args - Arguments to update many WorkflowTemplates.
     * @example
     * // Update many WorkflowTemplates
     * const workflowTemplate = await prisma.workflowTemplate.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more WorkflowTemplates and only return the `id`
     * const workflowTemplateWithIdOnly = await prisma.workflowTemplate.updateManyAndReturn({
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
    updateManyAndReturn<T extends WorkflowTemplateUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, WorkflowTemplateUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one WorkflowTemplate.
     * @param {WorkflowTemplateUpsertArgs} args - Arguments to update or create a WorkflowTemplate.
     * @example
     * // Update or create a WorkflowTemplate
     * const workflowTemplate = await prisma.workflowTemplate.upsert({
     *   create: {
     *     // ... data to create a WorkflowTemplate
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the WorkflowTemplate we want to update
     *   }
     * })
     */
    upsert<T extends WorkflowTemplateUpsertArgs>(args: Prisma.SelectSubset<T, WorkflowTemplateUpsertArgs<ExtArgs>>): Prisma.Prisma__WorkflowTemplateClient<runtime.Types.Result.GetResult<Prisma.$WorkflowTemplatePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of WorkflowTemplates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowTemplateCountArgs} args - Arguments to filter WorkflowTemplates to count.
     * @example
     * // Count the number of WorkflowTemplates
     * const count = await prisma.workflowTemplate.count({
     *   where: {
     *     // ... the filter for the WorkflowTemplates we want to count
     *   }
     * })
    **/
    count<T extends WorkflowTemplateCountArgs>(args?: Prisma.Subset<T, WorkflowTemplateCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], WorkflowTemplateCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a WorkflowTemplate.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowTemplateAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends WorkflowTemplateAggregateArgs>(args: Prisma.Subset<T, WorkflowTemplateAggregateArgs>): Prisma.PrismaPromise<GetWorkflowTemplateAggregateType<T>>;
    /**
     * Group by WorkflowTemplate.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowTemplateGroupByArgs} args - Group by arguments.
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
    groupBy<T extends WorkflowTemplateGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: WorkflowTemplateGroupByArgs['orderBy'];
    } : {
        orderBy?: WorkflowTemplateGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, WorkflowTemplateGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkflowTemplateGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the WorkflowTemplate model
     */
    readonly fields: WorkflowTemplateFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for WorkflowTemplate.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__WorkflowTemplateClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
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
 * Fields of the WorkflowTemplate model
 */
export interface WorkflowTemplateFieldRefs {
    readonly id: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly externalId: Prisma.FieldRef<"WorkflowTemplate", 'Int'>;
    readonly name: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly description: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly imageUrl: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly views: Prisma.FieldRef<"WorkflowTemplate", 'Int'>;
    readonly recentViews: Prisma.FieldRef<"WorkflowTemplate", 'Int'>;
    readonly nodeCount: Prisma.FieldRef<"WorkflowTemplate", 'Int'>;
    readonly nodeTypes: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly categories: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly authorName: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly authorUsername: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly authorAvatar: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly workflowJson: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly metaJson: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly sourceUrl: Prisma.FieldRef<"WorkflowTemplate", 'String'>;
    readonly readyToDemo: Prisma.FieldRef<"WorkflowTemplate", 'Boolean'>;
    readonly publishedAt: Prisma.FieldRef<"WorkflowTemplate", 'DateTime'>;
    readonly syncedAt: Prisma.FieldRef<"WorkflowTemplate", 'DateTime'>;
    readonly createdAt: Prisma.FieldRef<"WorkflowTemplate", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"WorkflowTemplate", 'DateTime'>;
}
/**
 * WorkflowTemplate findUnique
 */
export type WorkflowTemplateFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * Filter, which WorkflowTemplate to fetch.
     */
    where: Prisma.WorkflowTemplateWhereUniqueInput;
};
/**
 * WorkflowTemplate findUniqueOrThrow
 */
export type WorkflowTemplateFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * Filter, which WorkflowTemplate to fetch.
     */
    where: Prisma.WorkflowTemplateWhereUniqueInput;
};
/**
 * WorkflowTemplate findFirst
 */
export type WorkflowTemplateFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * Filter, which WorkflowTemplate to fetch.
     */
    where?: Prisma.WorkflowTemplateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of WorkflowTemplates to fetch.
     */
    orderBy?: Prisma.WorkflowTemplateOrderByWithRelationInput | Prisma.WorkflowTemplateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for WorkflowTemplates.
     */
    cursor?: Prisma.WorkflowTemplateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` WorkflowTemplates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` WorkflowTemplates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of WorkflowTemplates.
     */
    distinct?: Prisma.WorkflowTemplateScalarFieldEnum | Prisma.WorkflowTemplateScalarFieldEnum[];
};
/**
 * WorkflowTemplate findFirstOrThrow
 */
export type WorkflowTemplateFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * Filter, which WorkflowTemplate to fetch.
     */
    where?: Prisma.WorkflowTemplateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of WorkflowTemplates to fetch.
     */
    orderBy?: Prisma.WorkflowTemplateOrderByWithRelationInput | Prisma.WorkflowTemplateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for WorkflowTemplates.
     */
    cursor?: Prisma.WorkflowTemplateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` WorkflowTemplates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` WorkflowTemplates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of WorkflowTemplates.
     */
    distinct?: Prisma.WorkflowTemplateScalarFieldEnum | Prisma.WorkflowTemplateScalarFieldEnum[];
};
/**
 * WorkflowTemplate findMany
 */
export type WorkflowTemplateFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * Filter, which WorkflowTemplates to fetch.
     */
    where?: Prisma.WorkflowTemplateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of WorkflowTemplates to fetch.
     */
    orderBy?: Prisma.WorkflowTemplateOrderByWithRelationInput | Prisma.WorkflowTemplateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing WorkflowTemplates.
     */
    cursor?: Prisma.WorkflowTemplateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` WorkflowTemplates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` WorkflowTemplates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of WorkflowTemplates.
     */
    distinct?: Prisma.WorkflowTemplateScalarFieldEnum | Prisma.WorkflowTemplateScalarFieldEnum[];
};
/**
 * WorkflowTemplate create
 */
export type WorkflowTemplateCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * The data needed to create a WorkflowTemplate.
     */
    data: Prisma.XOR<Prisma.WorkflowTemplateCreateInput, Prisma.WorkflowTemplateUncheckedCreateInput>;
};
/**
 * WorkflowTemplate createMany
 */
export type WorkflowTemplateCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many WorkflowTemplates.
     */
    data: Prisma.WorkflowTemplateCreateManyInput | Prisma.WorkflowTemplateCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * WorkflowTemplate createManyAndReturn
 */
export type WorkflowTemplateCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * The data used to create many WorkflowTemplates.
     */
    data: Prisma.WorkflowTemplateCreateManyInput | Prisma.WorkflowTemplateCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * WorkflowTemplate update
 */
export type WorkflowTemplateUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * The data needed to update a WorkflowTemplate.
     */
    data: Prisma.XOR<Prisma.WorkflowTemplateUpdateInput, Prisma.WorkflowTemplateUncheckedUpdateInput>;
    /**
     * Choose, which WorkflowTemplate to update.
     */
    where: Prisma.WorkflowTemplateWhereUniqueInput;
};
/**
 * WorkflowTemplate updateMany
 */
export type WorkflowTemplateUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update WorkflowTemplates.
     */
    data: Prisma.XOR<Prisma.WorkflowTemplateUpdateManyMutationInput, Prisma.WorkflowTemplateUncheckedUpdateManyInput>;
    /**
     * Filter which WorkflowTemplates to update
     */
    where?: Prisma.WorkflowTemplateWhereInput;
    /**
     * Limit how many WorkflowTemplates to update.
     */
    limit?: number;
};
/**
 * WorkflowTemplate updateManyAndReturn
 */
export type WorkflowTemplateUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * The data used to update WorkflowTemplates.
     */
    data: Prisma.XOR<Prisma.WorkflowTemplateUpdateManyMutationInput, Prisma.WorkflowTemplateUncheckedUpdateManyInput>;
    /**
     * Filter which WorkflowTemplates to update
     */
    where?: Prisma.WorkflowTemplateWhereInput;
    /**
     * Limit how many WorkflowTemplates to update.
     */
    limit?: number;
};
/**
 * WorkflowTemplate upsert
 */
export type WorkflowTemplateUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * The filter to search for the WorkflowTemplate to update in case it exists.
     */
    where: Prisma.WorkflowTemplateWhereUniqueInput;
    /**
     * In case the WorkflowTemplate found by the `where` argument doesn't exist, create a new WorkflowTemplate with this data.
     */
    create: Prisma.XOR<Prisma.WorkflowTemplateCreateInput, Prisma.WorkflowTemplateUncheckedCreateInput>;
    /**
     * In case the WorkflowTemplate was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.WorkflowTemplateUpdateInput, Prisma.WorkflowTemplateUncheckedUpdateInput>;
};
/**
 * WorkflowTemplate delete
 */
export type WorkflowTemplateDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
    /**
     * Filter which WorkflowTemplate to delete.
     */
    where: Prisma.WorkflowTemplateWhereUniqueInput;
};
/**
 * WorkflowTemplate deleteMany
 */
export type WorkflowTemplateDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which WorkflowTemplates to delete
     */
    where?: Prisma.WorkflowTemplateWhereInput;
    /**
     * Limit how many WorkflowTemplates to delete.
     */
    limit?: number;
};
/**
 * WorkflowTemplate without action
 */
export type WorkflowTemplateDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowTemplate
     */
    select?: Prisma.WorkflowTemplateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the WorkflowTemplate
     */
    omit?: Prisma.WorkflowTemplateOmit<ExtArgs> | null;
};
