from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.units import inch
import matplotlib.pyplot as plt
from datetime import datetime


def generate_study_report_pdf(
    study_name: str,
    generated_at: str,
    metrics: dict,
    findings: list | None = None,
) -> BytesIO:
    """Study-level scientific report PDF (docs §19). Never frames a session as
    a clinical evaluation or a "patient": video/EEG results describe observed
    temporal patterns, not diagnoses, and tests/questionnaires are just one of
    several optional data sources — never a mandatory pre/post structure.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            rightMargin=72, leftMargin=72,
                            topMargin=72, bottomMargin=18)

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Center', alignment=1))

    elements = []

    # Header / Cover
    elements.append(Paragraph("<b>CAST Pro — Relatório de Estudo</b>", styles['Title']))
    elements.append(Spacer(1, 0.25 * inch))
    elements.append(Paragraph(f"<b>Estudo:</b> {study_name}", styles['Normal']))
    elements.append(Paragraph(f"<b>Gerado em:</b> {generated_at}", styles['Normal']))
    elements.append(Spacer(1, 0.5 * inch))

    if metrics:
        plt.figure(figsize=(6, 4))
        keys = list(metrics.keys())
        values = list(metrics.values())
        plt.bar(keys, values, color=['#2563EB', '#059669', '#D97706', '#7C3AED'][: len(keys)])
        plt.title("Indicadores agregados do estudo")
        plt.ylabel("Valor")

        img_buffer = BytesIO()
        plt.savefig(img_buffer, format='png', bbox_inches='tight')
        plt.close()
        img_buffer.seek(0)

        img = Image(img_buffer, width=4 * inch, height=2.5 * inch)
        elements.append(Paragraph("<b>Indicadores agregados</b>", styles['Heading2']))
        elements.append(Spacer(1, 0.1 * inch))
        elements.append(img)
        elements.append(Spacer(1, 0.5 * inch))

    if findings:
        elements.append(Paragraph("<b>Achados de qualidade</b>", styles['Heading2']))
        elements.append(Spacer(1, 0.1 * inch))
        table_data = [['Sessão', 'Modalidade', 'Veredito']]
        for row in findings:
            table_data.append([row.get('session', ''), row.get('modality', ''), row.get('verdict', '')])

        t = Table(table_data, colWidths=[2 * inch, 1.5 * inch, 1.7 * inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#2563EB")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#F9FAFB")),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 0.5 * inch))

    elements.append(Paragraph(
        "<i>Os resultados descrevem padrões observados nos dados coletados e não constituem diagnóstico. "
        "Associações entre modalidades não implicam causalidade e requerem validação estatística pelo "
        "pesquisador responsável.</i>",
        styles['Normal'],
    ))
    elements.append(Spacer(1, 1 * inch))

    elements.append(Paragraph("________________________________________________", styles['Center']))
    elements.append(Spacer(1, 0.1 * inch))
    elements.append(Paragraph("<b>Responsável pelo estudo</b>", styles['Center']))

    doc.build(elements)
    buffer.seek(0)
    return buffer
