const express = require('express');
const path = require('path');
const fs = require('fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  PageBreak
} = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser (increase limit for bulk invoice batches)
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export to Microsoft Word (.docx) endpoint
app.post('/api/export/docx', async (req, res) => {
  try {
    const { invoices, occupier, location, ntn } = req.body;

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({ error: 'No invoices provided' });
    }

    // Load logos
    const megaMallLogoPath = path.join(__dirname, 'public', 'assets', 'mega-mall-logo.png');
    const kampusLogoPath = path.join(__dirname, 'public', 'assets', 'kampus-logo.png');

    const megaMallLogoBytes = fs.existsSync(megaMallLogoPath) ? fs.readFileSync(megaMallLogoPath) : null;
    const kampusLogoBytes = fs.existsSync(kampusLogoPath) ? fs.readFileSync(kampusLogoPath) : null;

    const sections = [];

    // Table border style
    const solidBorder = {
      style: BorderStyle.SINGLE,
      size: 10,
      color: '000000'
    };

    const cellBorders = {
      top: solidBorder,
      bottom: solidBorder,
      left: solidBorder,
      right: solidBorder
    };

    const emptyBorder = {
      style: BorderStyle.NONE,
      size: 0,
      color: 'auto'
    };

    const noBorders = {
      top: emptyBorder,
      bottom: emptyBorder,
      left: emptyBorder,
      right: emptyBorder
    };

    const children = [];

    invoices.forEach((inv, index) => {
      // 1. Header Table (Logo Left, Title Center, Logo Right)
      const headerRowCells = [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: noBorders,
          alignment: AlignmentType.CENTER,
          children: [
            megaMallLogoBytes
              ? new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: megaMallLogoBytes,
                      transformation: { width: 95, height: 85 }
                    })
                  ]
                })
              : new Paragraph({ text: "MEGA MALL", alignment: AlignmentType.CENTER })
          ]
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noBorders,
          alignment: AlignmentType.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: "THE MEGA MALL",
                  bold: true,
                  size: 26,
                  font: "Arial"
                })
              ]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Official Billing Invoice / Reimburstment Note",
                  bold: true,
                  size: 19,
                  font: "Arial"
                })
              ]
            })
          ]
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: noBorders,
          alignment: AlignmentType.CENTER,
          children: [
            kampusLogoBytes
              ? new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: kampusLogoBytes,
                      transformation: { width: 70, height: 90 }
                    })
                  ]
                })
              : new Paragraph({ text: "KAMPUS", alignment: AlignmentType.CENTER })
          ]
        })
      ];

      const headerTable = new Table({
        rows: [new TableRow({ children: headerRowCells })],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(headerTable);
      children.push(new Paragraph({ spacing: { after: 200 } }));

      // 2. Customer & Invoice Info Table
      const metaTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 65, type: WidthType.PERCENTAGE },
                borders: noBorders,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: "Customer", bold: true, size: 20, font: "Arial" })],
                    spacing: { after: 60 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Legal Occupier: ", bold: true, size: 18, font: "Arial" }),
                      new TextRun({ text: occupier || "FALAKNAZ SPRINGS,", size: 18, font: "Arial" })
                    ],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Location: ", bold: true, size: 18, font: "Arial" }),
                      new TextRun({ text: location || "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,", size: 18, font: "Arial" })
                    ],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Billing Month: ", bold: true, size: 18, font: "Arial" }),
                      new TextRun({ text: inv.billingPeriod, size: 18, font: "Arial" })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 35, type: WidthType.PERCENTAGE },
                borders: noBorders,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "Invoice,", bold: true, size: 20, font: "Arial" })],
                    spacing: { after: 60 }
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: inv.invoiceNumber, bold: true, size: 19, font: "Arial" })],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({ text: `NTN: ${ntn || "C951537"}`, bold: true, size: 18, font: "Arial" })
                    ]
                  })
                ]
              })
            ]
          })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(metaTable);
      children.push(new Paragraph({ spacing: { after: 260 } }));

      // 3. Billing Table
      const thStyle = {
        borders: cellBorders,
        alignment: AlignmentType.CENTER
      };

      const billTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CONSUMPTION GALLON", bold: true, size: 16, font: "Arial" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "RATE PER GALLON", bold: true, size: 16, font: "Arial" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BILL AMOUNT", bold: true, size: 16, font: "Arial" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PREVIOUS", bold: true, size: 16, font: "Arial" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TOTAL PAYABLE", bold: true, size: 16, font: "Arial" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: Number(inv.gallons).toLocaleString(), size: 18, font: "Arial" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: Number(inv.rate).toFixed(2), size: 18, font: "Arial" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${Number(inv.billAmount).toLocaleString()}/-`, size: 18, font: "Arial" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: inv.previous === 0 ? "0" : `${Number(inv.previous).toLocaleString()}/-`, size: 18, font: "Arial" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${Number(inv.totalPayable).toLocaleString()}/-`, size: 18, font: "Arial" })] })]
              })
            ]
          })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(billTable);
      children.push(new Paragraph({ spacing: { after: 320 } }));

      // 4. Bullet Notices
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "• *Please make payment in favour of Kampus Integrated Services NTN: C951537 Account No: 10380109491064 in Meezan Bank.", size: 17, font: "Arial" })
          ],
          spacing: { after: 120 }
        })
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "• *If the payment is not received till the last payment date, \"The Mega Mall\" will hold the services of your lincensed area and will not held responsible for any losses Whats so ever there for.", size: 17, font: "Arial" })
          ],
          spacing: { after: 450 }
        })
      );

      // 5. Signoff
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Account Department", bold: true, size: 18, font: "Arial" })],
          spacing: { after: 50 }
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Date : ${inv.issueDate}`, bold: true, size: 18, font: "Arial" })],
          spacing: { after: 1200 }
        })
      );

      // 6. Footer Address
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "4 Floor, Mega Mall, Block-18, Gulishtan-E-Jauhar, Karachi.",
              bold: true,
              size: 17,
              font: "Arial"
            })
          ]
        })
      );

      // Add page break between invoices
      if (index < invoices.length - 1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 1080, right: 1080 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Water_Invoices.docx"');
    res.send(buffer);
  } catch (error) {
    console.error('Word export error:', error);
    res.status(500).json({ error: 'Failed to generate Word document', details: error.message });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
