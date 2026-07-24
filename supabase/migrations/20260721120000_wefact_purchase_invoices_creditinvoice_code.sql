-- WeFact's eigen inkoopfactuurnummer (CreditInvoiceCode, bv. IF0001) náást het
-- leverancierskenmerk (invoice_code); de lijst-respons kent geen CreditorCode.
alter table public.wefact_purchase_invoices add column if not exists creditinvoice_code text;
