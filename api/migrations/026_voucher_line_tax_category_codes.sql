UPDATE voucher_lines SET tax_category='taxable' WHERE tax_category='課税';
UPDATE voucher_lines SET tax_category='non_taxable' WHERE tax_category='非課税';
