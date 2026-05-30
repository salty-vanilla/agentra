'use client';

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronsUpDown, ChevronUp, Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DataTableProps<T> {
  data: T[];
  // biome-ignore lint/suspicious/noExplicitAny: column value types are heterogeneous; TanStack Table requires any here
  columns: ColumnDef<T, any>[];
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  virtualized?: boolean;
  height?: number | string;
  containerClassName?: string;
  estimatedRowHeight?: number;
  overscan?: number;
  resetSortingKey?: string | number;
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ChevronUp className="size-3.5 shrink-0" />;
  if (sorted === 'desc') return <ChevronDown className="size-3.5 shrink-0" />;
  return <ChevronsUpDown className="size-3.5 shrink-0 opacity-40" />;
}

function ariaSort(
  canSort: boolean,
  sorted: false | 'asc' | 'desc',
): 'ascending' | 'descending' | 'none' | undefined {
  if (!canSort) return undefined;
  if (sorted === 'asc') return 'ascending';
  if (sorted === 'desc') return 'descending';
  return 'none';
}

export function DataTable<T>({
  data,
  columns,
  isLoading,
  error,
  emptyMessage = 'No data for this period.',
  onRowClick,
  virtualized: isVirtualized = false,
  height,
  containerClassName,
  estimatedRowHeight = 37,
  overscan = 5,
  resetSortingKey,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetSortingKey is the intentional trigger
  useEffect(() => {
    setSorting([]);
  }, [resetSortingKey]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const shouldVirtualize = isVirtualized || height !== undefined;

  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
  });

  const isEmpty = rows.length === 0;
  const showEmpty = isEmpty && !isLoading && !error;
  const showLoading = isEmpty && !!isLoading && !error;
  const showError = isEmpty && !!error;
  const tableMinWidth = table
    .getVisibleLeafColumns()
    .reduce((width, column) => width + column.getSize(), 0);
  const tableStyle: React.CSSProperties = {
    minWidth: tableMinWidth > 0 ? `${tableMinWidth}px` : undefined,
    width: '100%',
  };

  const emptyCell = showError ? (
    <span className="inline-flex items-center rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1 text-destructive">
      {error}
    </span>
  ) : showLoading ? (
    <span className="inline-flex items-center gap-2 text-muted-foreground">
      <Loader2Icon className="size-3.5 animate-spin" />
      Loading...
    </span>
  ) : showEmpty ? (
    <span className="text-muted-foreground">{emptyMessage}</span>
  ) : null;

  if (shouldVirtualize) {
    const scrollStyle: React.CSSProperties = {};
    if (height !== undefined) {
      scrollStyle.height = typeof height === 'number' ? `${height}px` : height;
    }

    return (
      <div
        className={cn(
          'flex flex-col min-h-0 overflow-hidden rounded-lg border border-border bg-card tabular-nums',
          (height === '100%' || (isVirtualized && height === undefined)) &&
            'h-full flex-1',
          containerClassName,
        )}
      >
        <div
          ref={scrollRef}
          className={cn('overflow-auto', height === undefined && 'flex-1 min-h-0')}
          style={scrollStyle}
        >
          <table style={{ display: 'grid', ...tableStyle }}>
            <thead
              className="border-b bg-muted/70 text-muted-foreground"
              style={{ display: 'grid', position: 'sticky', top: 0, zIndex: 1 }}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} style={{ display: 'flex', width: '100%' }}>
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        style={{
                          flex: header.column.getSize(),
                          display: 'flex',
                          minWidth: 0,
                        }}
                        className="px-3 py-1.5 text-left text-sm font-medium"
                        aria-sort={ariaSort(canSort, sorted)}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 select-none text-muted-foreground hover:text-foreground"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <span className="truncate">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </span>
                            <SortIcon sorted={sorted} />
                          </button>
                        ) : (
                          <span className="truncate">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            <tbody
              style={{
                display: 'grid',
                height: isEmpty ? 'auto' : `${virtualizer.getTotalSize()}px`,
                position: isEmpty ? 'static' : 'relative',
              }}
            >
              {isEmpty ? (
                <tr style={{ display: 'flex', width: '100%' }}>
                  <td style={{ flex: 1 }} className="px-3 py-6 text-center text-sm">
                    {emptyCell}
                  </td>
                </tr>
              ) : (
                virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;
                  return (
                    <tr
                      key={row.id}
                      data-index={virtualRow.index}
                      ref={(node) => virtualizer.measureElement(node)}
                      style={{
                        display: 'flex',
                        position: 'absolute',
                        top: 0,
                        transform: `translateY(${virtualRow.start}px)`,
                        width: '100%',
                      }}
                      className={cn(
                        'border-t border-border hover:bg-muted/40',
                        onRowClick && 'cursor-pointer',
                      )}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          style={{
                            flex: cell.column.getSize(),
                            display: 'flex',
                            alignItems: 'center',
                            minWidth: 0,
                          }}
                          className="px-3 py-1.5 text-sm"
                        >
                          <span className="truncate">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Standard (non-virtualized) rendering
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-lg border border-border bg-card tabular-nums',
        containerClassName,
      )}
    >
      <table className="w-full text-sm" style={tableStyle}>
        <thead className="border-b bg-muted/70 text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    className="px-3 py-1.5 text-left font-medium"
                    aria-sort={ariaSort(canSort, sorted)}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 select-none text-muted-foreground hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon sorted={sorted} />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {emptyCell ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-sm">
                {emptyCell}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'border-t border-border hover:bg-muted/40',
                  onRowClick && 'cursor-pointer',
                )}
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
