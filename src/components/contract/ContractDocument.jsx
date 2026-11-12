import React, { useMemo } from "react";
import { parseContractMarkdown } from "@/lib/contract/parseContract";

function InlineRuns({ runs }) {
  return (
    <>
      {(runs || []).map((run, index) => {
        if (run.bold) {
          return <strong key={index}>{run.text}</strong>;
        }
        if (run.code) {
          return (
            <span key={index} className="contract-chip">
              {run.text}
            </span>
          );
        }
        return <React.Fragment key={index}>{run.text}</React.Fragment>;
      })}
    </>
  );
}

function Block({ block, index }) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}`;
      const className =
        index === 0
          ? "contract-title"
          : block.level === 1
            ? "contract-heading-1"
            : block.level === 2
              ? "contract-heading-2"
              : "contract-heading-3";
      return (
        <Tag className={className}>
          <InlineRuns runs={block.runs} />
        </Tag>
      );
    }

    case "list":
      return (
        <ul className="contract-list">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <InlineRuns runs={item} />
            </li>
          ))}
        </ul>
      );

    case "quote":
      return (
        <blockquote
          className={
            block.tone === "warning"
              ? "contract-quote contract-quote-warning"
              : "contract-quote"
          }
        >
          {block.lines.map((line, lineIndex) => (
            <p key={lineIndex}>
              <InlineRuns runs={line} />
            </p>
          ))}
        </blockquote>
      );

    case "table":
      return (
        <div className="contract-table-wrapper">
          <table className="contract-table">
            <thead>
              <tr>
                {block.header.map((cell, cellIndex) => (
                  <th
                    key={cellIndex}
                    style={{ textAlign: block.aligns[cellIndex] || "left" }}
                  >
                    <InlineRuns runs={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      style={{ textAlign: block.aligns[cellIndex] || "left" }}
                    >
                      <InlineRuns runs={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "hr":
      return <hr className="contract-hr" />;

    default:
      return (
        <p className="contract-paragraph">
          <InlineRuns runs={block.runs} />
        </p>
      );
  }
}

/**
 * Rendu « papier » du contrat à partir de son Markdown tokenisé.
 */
const ContractDocument = ({ markdown = "", className = "" }) => {
  const blocks = useMemo(() => parseContractMarkdown(markdown), [markdown]);

  return (
    <article className={`contract-doc ${className}`.trim()}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} index={index} />
      ))}
    </article>
  );
};

export default ContractDocument;
