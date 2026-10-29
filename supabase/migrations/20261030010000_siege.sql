-- Lot 4 : l'adresse du siège et le numéro RNA, imprimés en bas des quittances.
-- Siège transféré au 6 avenue Victor Le Gorgeu par décision du bureau du
-- 12 octobre 2026 (article 3 des statuts), récépissé de la sous-préfecture de
-- Brest du 14 octobre 2026. La trésorerie peut les changer dans « Réglages de
-- la cotisation ».

update public.dues_settings
set org_address = coalesce(org_address, '6 avenue Victor Le Gorgeu, 29200 Brest'),
    org_rna = coalesce(org_rna, 'W291017053');
