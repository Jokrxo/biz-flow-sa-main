import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InterpretationNote45() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>South Africa: Interpretation Note 45</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[520px] overflow-auto pr-4">
          <div className="space-y-6 text-sm leading-6">
            <section>
              <h2 className="text-lg font-semibold">Overview</h2>
              <p>
                Guidance on wear-and-tear and capital allowances applicable in South Africa, consolidating commonly
                applied schedules and rates for tax purposes. Use these as a reference when preparing VAT201 and tax
                computations. Your facts and asset classes determine the applicable allowance; always align with SARS
                directives and legislation.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Wear-and-Tear Allowances</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Computer hardware: typically 3 years straight-line.</li>
                <li>Computer software (off-the-shelf): typically 3 years straight-line.</li>
                <li>Motor vehicles (passenger): typically 5 years straight-line.</li>
                <li>Delivery vehicles (commercial): typically 4–5 years straight-line.</li>
                <li>Furniture and fittings: typically 6 years straight-line.</li>
                <li>Plant and machinery (general): often 5–10 years straight-line depending on class.</li>
                <li>Manufacturing equipment: per class schedules; commonly 5–10 years.</li>
                <li>Office equipment (printers, copiers): typically 3–5 years.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Capital Allowances</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Initial allowances for new plant used in manufacturing may apply.</li>
                <li>Section 12C/12B/12E allowances depending on industry and asset type.</li>
                <li>Small business corporation accelerated allowances where qualifying.</li>
                <li>Leasehold improvements and buildings subject to specific regimes (e.g., s13).</li>
                <li>Renewable energy assets may qualify for accelerated allowances.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Application Notes</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Use cost less any recoupments; apply pro‑rata for part‑year acquisitions/disposals.</li>
                <li>Where alternative schedules are more appropriate for usage, document justification.</li>
                <li>Keep asset register with acquisition date, cost, class, rate, method, opening/closing values.</li>
                <li>VAT implications: capital goods adjustments follow VAT Act; separate from income tax wear‑and‑tear.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Disclaimer</h2>
              <p>
                This summary is provided for convenience in the tax workspace. Confirm the latest SARS interpretation
                notes and legislation for precise rates and eligibility before filing.
              </p>
            </section>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default InterpretationNote45;
