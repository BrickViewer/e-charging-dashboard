import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderLinksCell, parseExtraLinks } from "./OrderLinksCell";

describe("parseExtraLinks", () => {
  it("leest alleen nette http(s)-links uit het jsonb-veld", () => {
    expect(
      parseExtraLinks([
        { label: "Elektramat", url: "https://elektramat.nl/x" },
        { label: "kwaad", url: "javascript:alert(1)" }, // gefilterd
        { url: "https://www.technischeunie.nl/y" }, // zonder label → hostname
        "onzin",
        null,
      ]),
    ).toEqual([
      { label: "Elektramat", url: "https://elektramat.nl/x" },
      { label: "technischeunie.nl", url: "https://www.technischeunie.nl/y" },
    ]);
  });

  it("geeft een lege lijst bij niet-array-invoer", () => {
    expect(parseExtraLinks(null)).toEqual([]);
    expect(parseExtraLinks({})).toEqual([]);
    expect(parseExtraLinks("x")).toEqual([]);
  });
});

describe("OrderLinksCell", () => {
  it("rendert niets zonder links", () => {
    const { container } = render(<OrderLinksCell orderUrl={null} extraLinks={[]} supplier="TU" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("toont de hoofdlink als veilige externe link", () => {
    render(<OrderLinksCell orderUrl="https://tu.nl/artikel/1" extraLinks={[]} supplier="TU" />);
    const a = screen.getByRole("link", { name: "Bestellen bij TU" });
    expect(a).toHaveAttribute("href", "https://tu.nl/artikel/1");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("weigert een onveilige hoofdlink", () => {
    const { container } = render(
      <OrderLinksCell orderUrl="javascript:alert(1)" extraLinks={[]} supplier="TU" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("toont een subtiele +n voor extra leveranciers", () => {
    render(
      <OrderLinksCell
        orderUrl="https://tu.nl/a"
        extraLinks={[
          { label: "Elektramat", url: "https://elektramat.nl/b" },
          { label: "Rexel", url: "https://rexel.nl/c" },
        ]}
        supplier="TU"
      />,
    );
    expect(screen.getByRole("button", { name: "Nog 2 leveranciers" })).toHaveTextContent("+2");
  });

  it("promoveert de eerste extra link tot hoofdlink als er geen bestellink is", () => {
    render(
      <OrderLinksCell
        orderUrl={null}
        extraLinks={[{ label: "Elektramat", url: "https://elektramat.nl/b" }]}
        supplier="TU"
      />,
    );
    const a = screen.getByRole("link", { name: "Bestellen bij Elektramat" });
    expect(a).toHaveAttribute("href", "https://elektramat.nl/b");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
