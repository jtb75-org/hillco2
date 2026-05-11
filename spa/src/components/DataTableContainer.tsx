import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
} from "@mui/material";
import type { ReactNode } from "react";

import { EmptyState } from "./EmptyState";

interface DataTableContainerProps {
  children: ReactNode;
  loading?: boolean;
  loadingColumns?: number;
  loadingRows?: number;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  footer?: ReactNode;
}

export function DataTableContainer({
  children,
  loading = false,
  loadingColumns = 4,
  loadingRows = 5,
  empty = false,
  emptyTitle = "No records",
  emptyDescription,
  emptyAction,
  footer,
}: DataTableContainerProps) {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      {loading ? (
        <TableContainer>
          <Table size="small">
            <TableBody>
              {Array.from({ length: loadingRows }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: loadingColumns }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton width="80%" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : empty ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <TableContainer>{children}</TableContainer>
      )}
      {footer && <Box sx={{ borderTop: 1, borderColor: "divider" }}>{footer}</Box>}
    </Paper>
  );
}
