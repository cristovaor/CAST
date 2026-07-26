from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Image,
    Table,
    TableStyle,
    PageBreak,
)
from reportlab.lib.units import inch
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from datetime import datetime
from reportlab.lib.enums import TA_CENTER


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


def _scientific_chart(report: dict) -> BytesIO | None:
    """Build the chart most appropriate for the selected report template."""
    template = report.get("template_key")
    figure, axis = plt.subplots(figsize=(7.2, 3.5))
    plotted = False

    if template == "individual_longitudinal":
        available = [
            item for item in report.get("outcomes", []) if item.get("available")
        ]
        if available:
            outcome = available[0]
            points = [
                (
                    item.get("session_index"),
                    item.get(outcome["id"]),
                    item.get("condition") or "Sem condição",
                )
                for item in report.get("series", [])
                if item.get(outcome["id"]) is not None
            ]
            if points:
                x_values = [item[0] for item in points]
                y_values = [item[1] for item in points]
                axis.plot(x_values, y_values, marker="o", color="#2563EB", linewidth=2)
                axis.set_xlabel("Sessão")
                axis.set_ylabel(
                    f"{outcome['label']} ({outcome.get('unit') or 'valor'})"
                )
                axis.set_title("Trajetória individual")
                plotted = True
    elif template == "control_group_comparison":
        estimates = [
            item
            for item in report.get("analyses", [])
            if item.get("estimate") is not None
        ]
        if estimates:
            labels = [item.get("outcome", "Desfecho") for item in estimates]
            values = [item["estimate"] for item in estimates]
            lows = [
                (item.get("confidence_interval") or [item["estimate"], item["estimate"]])[0]
                for item in estimates
            ]
            highs = [
                (item.get("confidence_interval") or [item["estimate"], item["estimate"]])[1]
                for item in estimates
            ]
            positions = list(range(len(values)))
            axis.errorbar(
                values,
                positions,
                xerr=[
                    [value - low for value, low in zip(values, lows)],
                    [high - value for value, high in zip(values, highs)],
                ],
                fmt="o",
                color="#2563EB",
                ecolor="#94A3B8",
                capsize=4,
            )
            axis.axvline(0, color="#64748B", linestyle="--", linewidth=1)
            axis.set_yticks(positions, labels)
            axis.set_xlabel("Diferença ajustada (comparação - controle)")
            axis.set_title("Estimativas e intervalos de confiança")
            plotted = True
    else:
        available = [
            item for item in report.get("outcomes", []) if item.get("available")
        ][:6]
        if available:
            labels = [item["label"] for item in available]
            means = [item["mean"] for item in available]
            axis.barh(labels, means, color="#2563EB")
            axis.set_title("Médias dos desfechos disponíveis")
            axis.set_xlabel("Valor observado")
            plotted = True

    if not plotted:
        plt.close(figure)
        return None
    axis.grid(axis="x", alpha=0.18)
    figure.tight_layout()
    image = BytesIO()
    figure.savefig(image, format="png", dpi=180, bbox_inches="tight")
    plt.close(figure)
    image.seek(0)
    return image


def generate_scientific_report_pdf(report: dict) -> BytesIO:
    """Generate the reproducible PDF companion for an analysis JSON payload."""
    buffer = BytesIO()

    def footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
        canvas.line(54, 34, A4[0] - 54, 34)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#64748B"))
        canvas.drawString(54, 22, "CAST Pro - Relatório científico")
        canvas.drawRightString(A4[0] - 54, 22, f"Página {document.page}")
        canvas.restoreState()

    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=48,
        title=f"Relatório científico - {report.get('study', {}).get('name', '')}",
    )
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ReportTitle",
            parent=styles["Title"],
            fontSize=22,
            leading=27,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ReportKicker",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#2563EB"),
            alignment=TA_CENTER,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ReportBody",
            parent=styles["BodyText"],
            fontSize=9.5,
            leading=14,
            textColor=colors.HexColor("#334155"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="ReportSmall",
            parent=styles["BodyText"],
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#475569"),
        )
    )

    template_labels = {
        "study_overview": "RELATÓRIO DO ESTUDO",
        "individual_longitudinal": "RELATÓRIO INDIVIDUAL LONGITUDINAL",
        "control_group_comparison": "COMPARAÇÃO COM GRUPO CONTROLE",
    }
    study = report.get("study", {})
    flow = report.get("flow", {})
    story = [
        Paragraph(
            template_labels.get(report.get("template_key"), "RELATÓRIO CIENTÍFICO"),
            styles["ReportKicker"],
        ),
        Paragraph(study.get("name", "Estudo"), styles["ReportTitle"]),
        Paragraph(
            (
                f"<b>Estrutura:</b> {study.get('reporting_framework', 'Não informada')} &nbsp;&nbsp; "
                f"<b>Protocolo:</b> {study.get('protocol_version') or 'não informado'}<br/>"
                f"<b>Gerado em:</b> {report.get('generated_at', '')} &nbsp;&nbsp; "
                f"<b>Metodologia:</b> {report.get('methodology_version', '')}"
            ),
            styles["ReportBody"],
        ),
        Spacer(1, 18),
    ]

    summary_data = [
        ["Fluxo amostral", "Incluídos", "Sessões", "Desfechos"],
        [
            f"{flow.get('participants_total', 0)} avaliados",
            str(flow.get("participants_included", 0)),
            str(flow.get("sessions_included", 0)),
            str(report.get("summary", {}).get("outcomes_available", 0)),
        ],
    ]
    summary_table = Table(summary_data, colWidths=[120, 100, 100, 100])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F8FAFC")),
                ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#0F172A")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    story.extend(
        [
            Paragraph("Resumo", styles["Heading2"]),
            summary_table,
            Spacer(1, 16),
        ]
    )

    chart = _scientific_chart(report)
    if chart is not None:
        story.extend(
            [
                Image(chart, width=6.5 * inch, height=3.15 * inch),
                Spacer(1, 12),
            ]
        )

    story.extend(
        [
            Paragraph("Métodos", styles["Heading2"]),
            Paragraph(
                (
                    f"Intervalo de confiança: {report.get('methods', {}).get('confidence_level', 0.95) * 100:.0f}%. "
                    f"{report.get('methods', {}).get('bootstrap', '')}. "
                    f"Multiplicidade: {report.get('methods', {}).get('multiplicity', '')}. "
                    f"{report.get('methods', {}).get('missing_data', '')}"
                ),
                styles["ReportBody"],
            ),
            Spacer(1, 12),
            Paragraph("Resultados descritivos", styles["Heading2"]),
        ]
    )
    outcome_rows = [["Desfecho", "n", "Média (DP)", "Mediana [Q1; Q3]", "Ausentes"]]
    for outcome in report.get("outcomes", []):
        if not outcome.get("available"):
            continue
        sd = outcome.get("sd")
        outcome_rows.append(
            [
                Paragraph(outcome.get("label", ""), styles["ReportSmall"]),
                str(outcome.get("n_observations", 0)),
                f"{outcome.get('mean', 0):.3f} ({sd:.3f})" if sd is not None else f"{outcome.get('mean', 0):.3f} (-)",
                f"{outcome.get('median', 0):.3f} [{outcome.get('q1', 0):.3f}; {outcome.get('q3', 0):.3f}]",
                str(outcome.get("missing", 0)),
            ]
        )
    if len(outcome_rows) == 1:
        outcome_rows.append(["Nenhum desfecho disponível", "-", "-", "-", "-"])
    outcome_table = Table(outcome_rows, repeatRows=1, colWidths=[140, 35, 85, 120, 45])
    outcome_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DBEAFE")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1E3A8A")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(outcome_table)

    analyses = report.get("analyses", [])
    if analyses:
        story.extend([PageBreak(), Paragraph("Análises inferenciais", styles["Heading2"])])
        analysis_rows = [
            [
                "Desfecho / termo",
                "Método",
                "Estimativa",
                "IC",
                "Efeito / n",
                "p",
                "p ajustado",
            ]
        ]
        for analysis in analyses:
            if analysis.get("terms"):
                for term in analysis["terms"]:
                    analysis_rows.append(
                        [
                            Paragraph(
                                f"{analysis.get('outcome', '')}: {term.get('term', '')}",
                                styles["ReportSmall"],
                            ),
                            Paragraph(
                                analysis.get("method", ""),
                                styles["ReportSmall"],
                            ),
                            f"{term.get('estimate', 0):.3f}",
                            _format_ci(term.get("confidence_interval")),
                            f"n={analysis.get('n_participants', '-')}",
                            _format_p(term.get("p_value")),
                            "-",
                        ]
                    )
            else:
                effect = analysis.get("effect_size") or {}
                effect_text = (
                    f"{effect.get('name', 'Efeito')}={_format_number(effect.get('value'))}; "
                    f"n={analysis.get('n_control', '-')}/{analysis.get('n_comparison', '-')}"
                )
                analysis_rows.append(
                    [
                        Paragraph(
                            analysis.get("outcome", ""),
                            styles["ReportSmall"],
                        ),
                        Paragraph(
                            analysis.get("method", ""),
                            styles["ReportSmall"],
                        ),
                        _format_number(analysis.get("estimate")),
                        _format_ci(analysis.get("confidence_interval")),
                        Paragraph(effect_text, styles["ReportSmall"]),
                        _format_p(analysis.get("p_value")),
                        _format_p(analysis.get("p_value_adjusted")),
                    ]
                )
        analysis_table = Table(
            analysis_rows,
            repeatRows=1,
            colWidths=[95, 115, 52, 72, 72, 34, 43],
        )
        analysis_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(analysis_table)

    story.extend(
        [
            Spacer(1, 16),
            Paragraph("Qualidade e limitações", styles["Heading2"]),
            Paragraph(
                (
                    f"Observações com qualidade de vídeo: {report.get('quality', {}).get('video_observations', 0)}. "
                    f"Observações com qualidade de EEG: {report.get('quality', {}).get('eeg_observations', 0)}."
                ),
                styles["ReportBody"],
            ),
        ]
    )
    for limitation in report.get("limitations", []):
        story.append(Paragraph(f"- {limitation}", styles["ReportBody"]))
    story.extend(
        [
            Spacer(1, 12),
            Paragraph(
                f"<b>Hash do snapshot:</b> {report.get('data_snapshot_hash', '')}",
                styles["ReportSmall"],
            ),
        ]
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    buffer.seek(0)
    return buffer


def _format_number(value):
    return "-" if value is None else f"{value:.3f}"


def _format_ci(value):
    if not value:
        return "-"
    return f"[{value[0]:.3f}; {value[1]:.3f}]"


def _format_p(value):
    if value is None:
        return "-"
    return "<0.001" if value < 0.001 else f"{value:.3f}"
