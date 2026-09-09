import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.ts";
/**
 * Model DataTableRow
 *
 */
export type DataTableRowModel = runtime.Types.Result.DefaultSelection<Prisma.$DataTableRowPayload>;
export type AggregateDataTableRow = {
    _count: DataTableRowCountAggregateOutputType | null;
    _avg: DataTableRowAvgAggregateOutputType | null;
    _sum: DataTableRowSumAggregateOutputType | null;
    _min: DataTableRowMinAggregateOutputType | null;
    _max: DataTableRowMaxAggregateOutputType | null;
};
export type DataTableRowAvgAggregateOutputType = {
    position: number | null;
};
export type DataTableRowSumAggregateOutputType = {
    position: number | null;
};
export type DataTableRowMinAggregateOutputType = {
    id: string | null;
    tableId: string | null;
    data: string | null;
    position: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type DataTableRowMaxAggregateOutputType = {
    id: string | null;
    tableId: string | null;
    data: string | null;
    position: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type DataTableRowCountAggregateOutputType = {
    id: number;
    tableId: number;
    data: number;
    position: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type DataTableRowAvgAggregateInputType = {
    position?: true;
};
export type DataTableRowSumAggregateInputType = {
    position?: true;
};
export type DataTableRowMinAggregateInputType = {
    id?: true;
    tableId?: true;
    data?: true;
    position?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type DataTableRowMaxAggregateInputType = {
    id?: true;
    tableId?: true;
    data?: true;
    position?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type DataTableRowCountAggregateInputType = {
    id?: true;
    tableId?: true;
    data?: true;
    position?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type DataTableRowAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which DataTableRow to aggregate.
     */
    where?: Prisma.DataTableRowWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DataTableRows to fetch.
     */
    orderBy?: Prisma.DataTableRowOrderByWithRelationInput | Prisma.DataTableRowOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.DataTableRowWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DataTableRows from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DataTableRows.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned DataTableRows
    **/
    _count?: true | DataTableRowCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: DataTableRowAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: DataTableRowSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: DataTableRowMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: DataTableRowMaxAggregateInputType;
};
export type GetDataTableRowAggregateType<T extends DataTableRowAggregateArgs> = {
    [P in keyof T & keyof AggregateDataTableRow]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateDataTableRow[P]> : Prisma.GetScalarType<T[P], AggregateDataTableRow[P]>;
};
export type DataTableRowGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.DataTableRowWhereInput;
    orderBy?: Prisma.DataTableRowOrderByWithAggregationInput | Prisma.DataTableRowOrderByWithAggregationInput[];
    by: Prisma.DataTableRowScalarFieldEnum[] | Prisma.DataTableRowScalarFieldEnum;
    having?: Prisma.DataTableRowScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: DataTableRowCountAggregateInputType | true;
    _avg?: DataTableRowAvgAggregateInputType;
    _sum?: DataTableRowSumAggregateInputType;
    _min?: DataTableRowMinAggregateInputType;
    _max?: DataTableRowMaxAggregateInputType;
};
export type DataTableRowGroupByOutputType = {
    id: string;
    tableId: string;
    data: string;
    position: number;
    createdAt: Date;
    updatedAt: Date;
    _count: DataTableRowCountAggregateOutputType | null;
    _avg: DataTableRowAvgAggregateOutputType | null;
    _sum: DataTableRowSumAggregateOutputType | null;
    _min: DataTableRowMinAggregateOutputType | null;
    _max: DataTableRowMaxAggregateOutputType | null;
};
export type GetDataTableRowGroupByPayload<T extends DataTableRowGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<DataTableRowGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof DataTableRowGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], DataTableRowGroupByOutputType[P]> : Prisma.GetScalarType<T[P], DataTableRowGroupByOutputType[P]>;
}>>;
export type DataTableRowWhereInput = {
    AND?: Prisma.DataTableRowWhereInput | Prisma.DataTableRowWhereInput[];
    OR?: Prisma.DataTableRowWhereInput[];
    NOT?: Prisma.DataTableRowWhereInput | Prisma.DataTableRowWhereInput[];
    id?: Prisma.StringFilter<"DataTableRow"> | string;
    tableId?: Prisma.StringFilter<"DataTableRow"> | string;
    data?: Prisma.StringFilter<"DataTableRow"> | string;
    position?: Prisma.IntFilter<"DataTableRow"> | number;
    createdAt?: Prisma.DateTimeFilter<"DataTableRow"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"DataTableRow"> | Date | string;
    table?: Prisma.XOR<Prisma.DataTableScalarRelationFilter, Prisma.DataTableWhereInput>;
};
export type DataTableRowOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    tableId?: Prisma.SortOrder;
    data?: Prisma.SortOrder;
    position?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    table?: Prisma.DataTableOrderByWithRelationInput;
};
export type DataTableRowWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.DataTableRowWhereInput | Prisma.DataTableRowWhereInput[];
    OR?: Prisma.DataTableRowWhereInput[];
    NOT?: Prisma.DataTableRowWhereInput | Prisma.DataTableRowWhereInput[];
    tableId?: Prisma.StringFilter<"DataTableRow"> | string;
    data?: Prisma.StringFilter<"DataTableRow"> | string;
    position?: Prisma.IntFilter<"DataTableRow"> | number;
    createdAt?: Prisma.DateTimeFilter<"DataTableRow"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"DataTableRow"> | Date | string;
    table?: Prisma.XOR<Prisma.DataTableScalarRelationFilter, Prisma.DataTableWhereInput>;
}, "id">;
export type DataTableRowOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    tableId?: Prisma.SortOrder;
    data?: Prisma.SortOrder;
    position?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.DataTableRowCountOrderByAggregateInput;
    _avg?: Prisma.DataTableRowAvgOrderByAggregateInput;
    _max?: Prisma.DataTableRowMaxOrderByAggregateInput;
    _min?: Prisma.DataTableRowMinOrderByAggregateInput;
    _sum?: Prisma.DataTableRowSumOrderByAggregateInput;
};
export type DataTableRowScalarWhereWithAggregatesInput = {
    AND?: Prisma.DataTableRowScalarWhereWithAggregatesInput | Prisma.DataTableRowScalarWhereWithAggregatesInput[];
    OR?: Prisma.DataTableRowScalarWhereWithAggregatesInput[];
    NOT?: Prisma.DataTableRowScalarWhereWithAggregatesInput | Prisma.DataTableRowScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"DataTableRow"> | string;
    tableId?: Prisma.StringWithAggregatesFilter<"DataTableRow"> | string;
    data?: Prisma.StringWithAggregatesFilter<"DataTableRow"> | string;
    position?: Prisma.IntWithAggregatesFilter<"DataTableRow"> | number;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"DataTableRow"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"DataTableRow"> | Date | string;
};
export type DataTableRowCreateInput = {
    id?: string;
    data?: string;
    position?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    table: Prisma.DataTableCreateNestedOneWithoutRowsInput;
};
export type DataTableRowUncheckedCreateInput = {
    id?: string;
    tableId: string;
    data?: string;
    position?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type DataTableRowUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    data?: Prisma.StringFieldUpdateOperationsInput | string;
    position?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    table?: Prisma.DataTableUpdateOneRequiredWithoutRowsNestedInput;
};
export type DataTableRowUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    tableId?: Prisma.StringFieldUpdateOperationsInput | string;
    data?: Prisma.StringFieldUpdateOperationsInput | string;
    position?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableRowCreateManyInput = {
    id?: string;
    tableId: string;
    data?: string;
    position?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type DataTableRowUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    data?: Prisma.StringFieldUpdateOperationsInput | string;
    position?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableRowUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    tableId?: Prisma.StringFieldUpdateOperationsInput | string;
    data?: Prisma.StringFieldUpdateOperationsInput | string;
    position?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableRowListRelationFilter = {
    every?: Prisma.DataTableRowWhereInput;
    some?: Prisma.DataTableRowWhereInput;
    none?: Prisma.DataTableRowWhereInput;
};
export type DataTableRowOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type DataTableRowCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    tableId?: Prisma.SortOrder;
    data?: Prisma.SortOrder;
    position?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type DataTableRowAvgOrderByAggregateInput = {
    position?: Prisma.SortOrder;
};
export type DataTableRowMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    tableId?: Prisma.SortOrder;
    data?: Prisma.SortOrder;
    position?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type DataTableRowMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    tableId?: Prisma.SortOrder;
    data?: Prisma.SortOrder;
    position?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type DataTableRowSumOrderByAggregateInput = {
    position?: Prisma.SortOrder;
};
export type DataTableRowCreateNestedManyWithoutTableInput = {
    create?: Prisma.XOR<Prisma.DataTableRowCreateWithoutTableInput, Prisma.DataTableRowUncheckedCreateWithoutTableInput> | Prisma.DataTableRowCreateWithoutTableInput[] | Prisma.DataTableRowUncheckedCreateWithoutTableInput[];
    connectOrCreate?: Prisma.DataTableRowCreateOrConnectWithoutTableInput | Prisma.DataTableRowCreateOrConnectWithoutTableInput[];
    createMany?: Prisma.DataTableRowCreateManyTableInputEnvelope;
    connect?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
};
export type DataTableRowUncheckedCreateNestedManyWithoutTableInput = {
    create?: Prisma.XOR<Prisma.DataTableRowCreateWithoutTableInput, Prisma.DataTableRowUncheckedCreateWithoutTableInput> | Prisma.DataTableRowCreateWithoutTableInput[] | Prisma.DataTableRowUncheckedCreateWithoutTableInput[];
    connectOrCreate?: Prisma.DataTableRowCreateOrConnectWithoutTableInput | Prisma.DataTableRowCreateOrConnectWithoutTableInput[];
    createMany?: Prisma.DataTableRowCreateManyTableInputEnvelope;
    connect?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
};
export type DataTableRowUpdateManyWithoutTableNestedInput = {
    create?: Prisma.XOR<Prisma.DataTableRowCreateWithoutTableInput, Prisma.DataTableRowUncheckedCreateWithoutTableInput> | Prisma.DataTableRowCreateWithoutTableInput[] | Prisma.DataTableRowUncheckedCreateWithoutTableInput[];
    connectOrCreate?: Prisma.DataTableRowCreateOrConnectWithoutTableInput | Prisma.DataTableRowCreateOrConnectWithoutTableInput[];
    upsert?: Prisma.DataTableRowUpsertWithWhereUniqueWithoutTableInput | Prisma.DataTableRowUpsertWithWhereUniqueWithoutTableInput[];
    createMany?: Prisma.DataTableRowCreateManyTableInputEnvelope;
    set?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
    disconnect?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
    delete?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
    connect?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
    update?: Prisma.DataTableRowUpdateWithWhereUniqueWithoutTableInput | Prisma.DataTableRowUpdateWithWhereUniqueWithoutTableInput[];
    updateMany?: Prisma.DataTableRowUpdateManyWithWhereWithoutTableInput | Prisma.DataTableRowUpdateManyWithWhereWithoutTableInput[];
    deleteMany?: Prisma.DataTableRowScalarWhereInput | Prisma.DataTableRowScalarWhereInput[];
};
export type DataTableRowUncheckedUpdateManyWithoutTableNestedInput = {
    create?: Prisma.XOR<Prisma.DataTableRowCreateWithoutTableInput, Prisma.DataTableRowUncheckedCreateWithoutTableInput> | Prisma.DataTableRowCreateWithoutTableInput[] | Prisma.DataTableRowUncheckedCreateWithoutTableInput[];
    connectOrCreate?: Prisma.DataTableRowCreateOrConnectWithoutTableInput | Prisma.DataTableRowCreateOrConnectWithoutTableInput[];
    upsert?: Prisma.DataTableRowUpsertWithWhereUniqueWithoutTableInput | Prisma.DataTableRowUpsertWithWhereUniqueWithoutTableInput[];
    createMany?: Prisma.DataTableRowCreateManyTableInputEnvelope;
    set?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
    disconnect?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
    delete?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
    connect?: Prisma.DataTableRowWhereUniqueInput | Prisma.DataTableRowWhereUniqueInput[];
    update?: Prisma.DataTableRowUpdateWithWhereUniqueWithoutTableInput | Prisma.DataTableRowUpdateWithWhereUniqueWithoutTableInput[];
    updateMany?: Prisma.DataTableRowUpdateManyWithWhereWithoutTableInput | Prisma.DataTableRowUpdateManyWithWhereWithoutTableInput[];
    deleteMany?: Prisma.DataTableRowScalarWhereInput | Prisma.DataTableRowScalarWhereInput[];
};
export type DataTableRowCreateWithoutTableInput = {
    id?: string;
    data?: string;
    position?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type DataTableRowUncheckedCreateWithoutTableInput = {
    id?: string;
    data?: string;
    position?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type DataTableRowCreateOrConnectWithoutTableInput = {
    where: Prisma.DataTableRowWhereUniqueInput;
    create: Prisma.XOR<Prisma.DataTableRowCreateWithoutTableInput, Prisma.DataTableRowUncheckedCreateWithoutTableInput>;
};
export type DataTableRowCreateManyTableInputEnvelope = {
    data: Prisma.DataTableRowCreateManyTableInput | Prisma.DataTableRowCreateManyTableInput[];
    skipDuplicates?: boolean;
};
export type DataTableRowUpsertWithWhereUniqueWithoutTableInput = {
    where: Prisma.DataTableRowWhereUniqueInput;
    update: Prisma.XOR<Prisma.DataTableRowUpdateWithoutTableInput, Prisma.DataTableRowUncheckedUpdateWithoutTableInput>;
    create: Prisma.XOR<Prisma.DataTableRowCreateWithoutTableInput, Prisma.DataTableRowUncheckedCreateWithoutTableInput>;
};
export type DataTableRowUpdateWithWhereUniqueWithoutTableInput = {
    where: Prisma.DataTableRowWhereUniqueInput;
    data: Prisma.XOR<Prisma.DataTableRowUpdateWithoutTableInput, Prisma.DataTableRowUncheckedUpdateWithoutTableInput>;
};
export type DataTableRowUpdateManyWithWhereWithoutTableInput = {
    where: Prisma.DataTableRowScalarWhereInput;
    data: Prisma.XOR<Prisma.DataTableRowUpdateManyMutationInput, Prisma.DataTableRowUncheckedUpdateManyWithoutTableInput>;
};
export type DataTableRowScalarWhereInput = {
    AND?: Prisma.DataTableRowScalarWhereInput | Prisma.DataTableRowScalarWhereInput[];
    OR?: Prisma.DataTableRowScalarWhereInput[];
    NOT?: Prisma.DataTableRowScalarWhereInput | Prisma.DataTableRowScalarWhereInput[];
    id?: Prisma.StringFilter<"DataTableRow"> | string;
    tableId?: Prisma.StringFilter<"DataTableRow"> | string;
    data?: Prisma.StringFilter<"DataTableRow"> | string;
    position?: Prisma.IntFilter<"DataTableRow"> | number;
    createdAt?: Prisma.DateTimeFilter<"DataTableRow"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"DataTableRow"> | Date | string;
};
export type DataTableRowCreateManyTableInput = {
    id?: string;
    data?: string;
    position?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type DataTableRowUpdateWithoutTableInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    data?: Prisma.StringFieldUpdateOperationsInput | string;
    position?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableRowUncheckedUpdateWithoutTableInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    data?: Prisma.StringFieldUpdateOperationsInput | string;
    position?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableRowUncheckedUpdateManyWithoutTableInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    data?: Prisma.StringFieldUpdateOperationsInput | string;
    position?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type DataTableRowSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    tableId?: boolean;
    data?: boolean;
    position?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    table?: boolean | Prisma.DataTableDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["dataTableRow"]>;
export type DataTableRowSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    tableId?: boolean;
    data?: boolean;
    position?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    table?: boolean | Prisma.DataTableDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["dataTableRow"]>;
export type DataTableRowSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    tableId?: boolean;
    data?: boolean;
    position?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    table?: boolean | Prisma.DataTableDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["dataTableRow"]>;
export type DataTableRowSelectScalar = {
    id?: boolean;
    tableId?: boolean;
    data?: boolean;
    position?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type DataTableRowOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "tableId" | "data" | "position" | "createdAt" | "updatedAt", ExtArgs["result"]["dataTableRow"]>;
export type DataTableRowInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    table?: boolean | Prisma.DataTableDefaultArgs<ExtArgs>;
};
export type DataTableRowIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    table?: boolean | Prisma.DataTableDefaultArgs<ExtArgs>;
};
export type DataTableRowIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    table?: boolean | Prisma.DataTableDefaultArgs<ExtArgs>;
};
export type $DataTableRowPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "DataTableRow";
    objects: {
        table: Prisma.$DataTablePayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        tableId: string;
        data: string;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["dataTableRow"]>;
    composites: {};
};
export type DataTableRowGetPayload<S extends boolean | null | undefined | DataTableRowDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload, S>;
export type DataTableRowCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<DataTableRowFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: DataTableRowCountAggregateInputType | true;
};
export interface DataTableRowDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['DataTableRow'];
        meta: {
            name: 'DataTableRow';
        };
    };
    /**
     * Find zero or one DataTableRow that matches the filter.
     * @param {DataTableRowFindUniqueArgs} args - Arguments to find a DataTableRow
     * @example
     * // Get one DataTableRow
     * const dataTableRow = await prisma.dataTableRow.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DataTableRowFindUniqueArgs>(args: Prisma.SelectSubset<T, DataTableRowFindUniqueArgs<ExtArgs>>): Prisma.Prisma__DataTableRowClient<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one DataTableRow that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DataTableRowFindUniqueOrThrowArgs} args - Arguments to find a DataTableRow
     * @example
     * // Get one DataTableRow
     * const dataTableRow = await prisma.dataTableRow.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DataTableRowFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, DataTableRowFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__DataTableRowClient<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first DataTableRow that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableRowFindFirstArgs} args - Arguments to find a DataTableRow
     * @example
     * // Get one DataTableRow
     * const dataTableRow = await prisma.dataTableRow.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DataTableRowFindFirstArgs>(args?: Prisma.SelectSubset<T, DataTableRowFindFirstArgs<ExtArgs>>): Prisma.Prisma__DataTableRowClient<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first DataTableRow that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableRowFindFirstOrThrowArgs} args - Arguments to find a DataTableRow
     * @example
     * // Get one DataTableRow
     * const dataTableRow = await prisma.dataTableRow.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DataTableRowFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, DataTableRowFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__DataTableRowClient<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more DataTableRows that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableRowFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all DataTableRows
     * const dataTableRows = await prisma.dataTableRow.findMany()
     *
     * // Get first 10 DataTableRows
     * const dataTableRows = await prisma.dataTableRow.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const dataTableRowWithIdOnly = await prisma.dataTableRow.findMany({ select: { id: true } })
     *
     */
    findMany<T extends DataTableRowFindManyArgs>(args?: Prisma.SelectSubset<T, DataTableRowFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a DataTableRow.
     * @param {DataTableRowCreateArgs} args - Arguments to create a DataTableRow.
     * @example
     * // Create one DataTableRow
     * const DataTableRow = await prisma.dataTableRow.create({
     *   data: {
     *     // ... data to create a DataTableRow
     *   }
     * })
     *
     */
    create<T extends DataTableRowCreateArgs>(args: Prisma.SelectSubset<T, DataTableRowCreateArgs<ExtArgs>>): Prisma.Prisma__DataTableRowClient<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many DataTableRows.
     * @param {DataTableRowCreateManyArgs} args - Arguments to create many DataTableRows.
     * @example
     * // Create many DataTableRows
     * const dataTableRow = await prisma.dataTableRow.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends DataTableRowCreateManyArgs>(args?: Prisma.SelectSubset<T, DataTableRowCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many DataTableRows and returns the data saved in the database.
     * @param {DataTableRowCreateManyAndReturnArgs} args - Arguments to create many DataTableRows.
     * @example
     * // Create many DataTableRows
     * const dataTableRow = await prisma.dataTableRow.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many DataTableRows and only return the `id`
     * const dataTableRowWithIdOnly = await prisma.dataTableRow.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends DataTableRowCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, DataTableRowCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a DataTableRow.
     * @param {DataTableRowDeleteArgs} args - Arguments to delete one DataTableRow.
     * @example
     * // Delete one DataTableRow
     * const DataTableRow = await prisma.dataTableRow.delete({
     *   where: {
     *     // ... filter to delete one DataTableRow
     *   }
     * })
     *
     */
    delete<T extends DataTableRowDeleteArgs>(args: Prisma.SelectSubset<T, DataTableRowDeleteArgs<ExtArgs>>): Prisma.Prisma__DataTableRowClient<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one DataTableRow.
     * @param {DataTableRowUpdateArgs} args - Arguments to update one DataTableRow.
     * @example
     * // Update one DataTableRow
     * const dataTableRow = await prisma.dataTableRow.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends DataTableRowUpdateArgs>(args: Prisma.SelectSubset<T, DataTableRowUpdateArgs<ExtArgs>>): Prisma.Prisma__DataTableRowClient<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more DataTableRows.
     * @param {DataTableRowDeleteManyArgs} args - Arguments to filter DataTableRows to delete.
     * @example
     * // Delete a few DataTableRows
     * const { count } = await prisma.dataTableRow.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends DataTableRowDeleteManyArgs>(args?: Prisma.SelectSubset<T, DataTableRowDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more DataTableRows.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableRowUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many DataTableRows
     * const dataTableRow = await prisma.dataTableRow.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends DataTableRowUpdateManyArgs>(args: Prisma.SelectSubset<T, DataTableRowUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more DataTableRows and returns the data updated in the database.
     * @param {DataTableRowUpdateManyAndReturnArgs} args - Arguments to update many DataTableRows.
     * @example
     * // Update many DataTableRows
     * const dataTableRow = await prisma.dataTableRow.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more DataTableRows and only return the `id`
     * const dataTableRowWithIdOnly = await prisma.dataTableRow.updateManyAndReturn({
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
    updateManyAndReturn<T extends DataTableRowUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, DataTableRowUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one DataTableRow.
     * @param {DataTableRowUpsertArgs} args - Arguments to update or create a DataTableRow.
     * @example
     * // Update or create a DataTableRow
     * const dataTableRow = await prisma.dataTableRow.upsert({
     *   create: {
     *     // ... data to create a DataTableRow
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the DataTableRow we want to update
     *   }
     * })
     */
    upsert<T extends DataTableRowUpsertArgs>(args: Prisma.SelectSubset<T, DataTableRowUpsertArgs<ExtArgs>>): Prisma.Prisma__DataTableRowClient<runtime.Types.Result.GetResult<Prisma.$DataTableRowPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of DataTableRows.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableRowCountArgs} args - Arguments to filter DataTableRows to count.
     * @example
     * // Count the number of DataTableRows
     * const count = await prisma.dataTableRow.count({
     *   where: {
     *     // ... the filter for the DataTableRows we want to count
     *   }
     * })
    **/
    count<T extends DataTableRowCountArgs>(args?: Prisma.Subset<T, DataTableRowCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], DataTableRowCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a DataTableRow.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableRowAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends DataTableRowAggregateArgs>(args: Prisma.Subset<T, DataTableRowAggregateArgs>): Prisma.PrismaPromise<GetDataTableRowAggregateType<T>>;
    /**
     * Group by DataTableRow.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DataTableRowGroupByArgs} args - Group by arguments.
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
    groupBy<T extends DataTableRowGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: DataTableRowGroupByArgs['orderBy'];
    } : {
        orderBy?: DataTableRowGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, DataTableRowGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDataTableRowGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the DataTableRow model
     */
    readonly fields: DataTableRowFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for DataTableRow.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__DataTableRowClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    table<T extends Prisma.DataTableDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.DataTableDefaultArgs<ExtArgs>>): Prisma.Prisma__DataTableClient<runtime.Types.Result.GetResult<Prisma.$DataTablePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
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
 * Fields of the DataTableRow model
 */
export interface DataTableRowFieldRefs {
    readonly id: Prisma.FieldRef<"DataTableRow", 'String'>;
    readonly tableId: Prisma.FieldRef<"DataTableRow", 'String'>;
    readonly data: Prisma.FieldRef<"DataTableRow", 'String'>;
    readonly position: Prisma.FieldRef<"DataTableRow", 'Int'>;
    readonly createdAt: Prisma.FieldRef<"DataTableRow", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"DataTableRow", 'DateTime'>;
}
/**
 * DataTableRow findUnique
 */
export type DataTableRowFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    /**
     * Filter, which DataTableRow to fetch.
     */
    where: Prisma.DataTableRowWhereUniqueInput;
};
/**
 * DataTableRow findUniqueOrThrow
 */
export type DataTableRowFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    /**
     * Filter, which DataTableRow to fetch.
     */
    where: Prisma.DataTableRowWhereUniqueInput;
};
/**
 * DataTableRow findFirst
 */
export type DataTableRowFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    /**
     * Filter, which DataTableRow to fetch.
     */
    where?: Prisma.DataTableRowWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DataTableRows to fetch.
     */
    orderBy?: Prisma.DataTableRowOrderByWithRelationInput | Prisma.DataTableRowOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for DataTableRows.
     */
    cursor?: Prisma.DataTableRowWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DataTableRows from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DataTableRows.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of DataTableRows.
     */
    distinct?: Prisma.DataTableRowScalarFieldEnum | Prisma.DataTableRowScalarFieldEnum[];
};
/**
 * DataTableRow findFirstOrThrow
 */
export type DataTableRowFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    /**
     * Filter, which DataTableRow to fetch.
     */
    where?: Prisma.DataTableRowWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DataTableRows to fetch.
     */
    orderBy?: Prisma.DataTableRowOrderByWithRelationInput | Prisma.DataTableRowOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for DataTableRows.
     */
    cursor?: Prisma.DataTableRowWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DataTableRows from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DataTableRows.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of DataTableRows.
     */
    distinct?: Prisma.DataTableRowScalarFieldEnum | Prisma.DataTableRowScalarFieldEnum[];
};
/**
 * DataTableRow findMany
 */
export type DataTableRowFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    /**
     * Filter, which DataTableRows to fetch.
     */
    where?: Prisma.DataTableRowWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DataTableRows to fetch.
     */
    orderBy?: Prisma.DataTableRowOrderByWithRelationInput | Prisma.DataTableRowOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing DataTableRows.
     */
    cursor?: Prisma.DataTableRowWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DataTableRows from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DataTableRows.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of DataTableRows.
     */
    distinct?: Prisma.DataTableRowScalarFieldEnum | Prisma.DataTableRowScalarFieldEnum[];
};
/**
 * DataTableRow create
 */
export type DataTableRowCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    /**
     * The data needed to create a DataTableRow.
     */
    data: Prisma.XOR<Prisma.DataTableRowCreateInput, Prisma.DataTableRowUncheckedCreateInput>;
};
/**
 * DataTableRow createMany
 */
export type DataTableRowCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many DataTableRows.
     */
    data: Prisma.DataTableRowCreateManyInput | Prisma.DataTableRowCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * DataTableRow createManyAndReturn
 */
export type DataTableRowCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * The data used to create many DataTableRows.
     */
    data: Prisma.DataTableRowCreateManyInput | Prisma.DataTableRowCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * DataTableRow update
 */
export type DataTableRowUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    /**
     * The data needed to update a DataTableRow.
     */
    data: Prisma.XOR<Prisma.DataTableRowUpdateInput, Prisma.DataTableRowUncheckedUpdateInput>;
    /**
     * Choose, which DataTableRow to update.
     */
    where: Prisma.DataTableRowWhereUniqueInput;
};
/**
 * DataTableRow updateMany
 */
export type DataTableRowUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update DataTableRows.
     */
    data: Prisma.XOR<Prisma.DataTableRowUpdateManyMutationInput, Prisma.DataTableRowUncheckedUpdateManyInput>;
    /**
     * Filter which DataTableRows to update
     */
    where?: Prisma.DataTableRowWhereInput;
    /**
     * Limit how many DataTableRows to update.
     */
    limit?: number;
};
/**
 * DataTableRow updateManyAndReturn
 */
export type DataTableRowUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * The data used to update DataTableRows.
     */
    data: Prisma.XOR<Prisma.DataTableRowUpdateManyMutationInput, Prisma.DataTableRowUncheckedUpdateManyInput>;
    /**
     * Filter which DataTableRows to update
     */
    where?: Prisma.DataTableRowWhereInput;
    /**
     * Limit how many DataTableRows to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * DataTableRow upsert
 */
export type DataTableRowUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    /**
     * The filter to search for the DataTableRow to update in case it exists.
     */
    where: Prisma.DataTableRowWhereUniqueInput;
    /**
     * In case the DataTableRow found by the `where` argument doesn't exist, create a new DataTableRow with this data.
     */
    create: Prisma.XOR<Prisma.DataTableRowCreateInput, Prisma.DataTableRowUncheckedCreateInput>;
    /**
     * In case the DataTableRow was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.DataTableRowUpdateInput, Prisma.DataTableRowUncheckedUpdateInput>;
};
/**
 * DataTableRow delete
 */
export type DataTableRowDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
    /**
     * Filter which DataTableRow to delete.
     */
    where: Prisma.DataTableRowWhereUniqueInput;
};
/**
 * DataTableRow deleteMany
 */
export type DataTableRowDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which DataTableRows to delete
     */
    where?: Prisma.DataTableRowWhereInput;
    /**
     * Limit how many DataTableRows to delete.
     */
    limit?: number;
};
/**
 * DataTableRow without action
 */
export type DataTableRowDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DataTableRow
     */
    select?: Prisma.DataTableRowSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the DataTableRow
     */
    omit?: Prisma.DataTableRowOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.DataTableRowInclude<ExtArgs> | null;
};
