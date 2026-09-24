import { fetchInspectRows, fetchInspectSchema } from "./db-client.js"
import type { InspectTableGroup } from "./inspect.js"
import type { InspectRows } from "./types.js"

export const DB_TABLE_PAGE_SIZE = 100

export function renderDbTableList(
  container: HTMLElement,
  groups: InspectTableGroup[],
  selectedTable: string | null,
  onSelect: (table: string) => void,
) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "panel-title";
  heading.textContent = "Tables";
  container.appendChild(heading);

  for (const group of groups) {
    if (!group.tables.length) {
      continue;
    }
    const title = document.createElement("h3");
    title.className = "db-table-group-title";
    title.textContent = group.label;
    container.appendChild(title);

    const list = document.createElement("ul");
    list.className = "db-table-list";
    for (const table of group.tables) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `db-table-row${selectedTable === table.name ? " selected" : ""}`;
      button.textContent = `${table.name} (${table.rowCount})`;
      button.addEventListener("click", () => {
        onSelect(table.name);
      });
      item.appendChild(button);
      list.appendChild(item);
    }
    container.appendChild(list);
  }
}

export async function renderDbDetails(
  container: HTMLElement,
  table: string,
  offset: number,
  onPage: (nextOffset: number) => void,
): Promise<InspectRows> {
  const [schema, data] = await Promise.all([
    fetchInspectSchema(table),
    fetchInspectRows(table, offset, DB_TABLE_PAGE_SIZE),
  ]);

  container.innerHTML = "";
  const title = document.createElement("h2");
  title.textContent = table;
  container.appendChild(title);

  const schemaSection = document.createElement("section");
  schemaSection.className = "section";
  schemaSection.innerHTML = `<h3>Columns</h3>`;
  const schemaTable = document.createElement("table");
  schemaTable.className = "data-table";
  schemaTable.innerHTML = `<thead><tr><th>Name</th><th>Type</th><th>PK</th><th>NOT NULL</th></tr></thead>`;
  const schemaBody = document.createElement("tbody");
  for (const column of schema) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${escapeHtml(column.name)}</td><td>${escapeHtml(column.type)}</td><td>${column.pk ? "yes" : ""}</td><td>${column.notnull ? "yes" : ""}</td>`;
    schemaBody.appendChild(row);
  }
  schemaTable.appendChild(schemaBody);
  schemaSection.appendChild(wrapTable(schemaTable));
  container.appendChild(schemaSection);

  appendRowsSection(container, data, onPage);
  return data
}

function appendRowsSection(container: HTMLElement, data: InspectRows, onPage: (nextOffset: number) => void) {
  const rowsSection = document.createElement("section");
  rowsSection.className = "section";
  const heading = document.createElement("h3");
  heading.textContent = `Rows ${data.offset + 1}-${Math.min(data.offset + data.rows.length, data.rowCount)} of ${data.rowCount}`;
  rowsSection.appendChild(heading);

  const table = document.createElement("table");
  table.className = "data-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of data.columns) {
    const th = document.createElement("th");
    th.textContent = column;
    headRow.appendChild(th);
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement("tbody");
  for (const row of data.rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      if (cell === "NULL") {
        td.className = "null-cell";
      }
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  rowsSection.appendChild(wrapTable(table));

  const pager = document.createElement("div");
  pager.className = "pager";
  if (data.offset > 0) {
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Previous";
    prev.title = "Show the previous page of rows.";
    prev.addEventListener("click", () => {
      onPage(Math.max(0, data.offset - data.limit));
    });
    pager.appendChild(prev);
  }
  if (data.offset + data.limit < data.rowCount) {
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.title = "Show the next page of rows.";
    next.addEventListener("click", () => {
      onPage(data.offset + data.limit);
    });
    pager.appendChild(next);
  }
  rowsSection.appendChild(pager);
  container.appendChild(rowsSection);
}

function wrapTable(table: HTMLTableElement): HTMLDivElement {
  const scroll = document.createElement("div");
  scroll.className = "table-scroll";
  scroll.appendChild(table);
  return scroll;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
