
import { DocumentLabel, PageData } from './types';

// We simulate the OCR text output from the provided PDF pages
// NOTE: Raw text matches the visual layout of the PDF (using spaces for alignment)
// to support the "Visual Verification" step using monospace rendering.
export const MOCK_PAGES: PageData[] = [
  {
    id: 1,
    rawText: `TAX RECORD INFORMATION SHEET

REFINANCE [ ]Yes [ x ] No
LOAN # 20414784

BORROWER(S) NAME: Alya Renard-Van Mercer

PROPERTY ADDRESS: 604N C restview Hill Dr, Unit 1144, Las Vegas, NV 89139`,
    predictedLabel: DocumentLabel.TAX_RECORD,
    confidence: 0.98,
    extractedFields: {
      borrower_name: "Alya Renard-Van Mercer",
      property_address: "604N C restview Hill Dr, Unit 1144, Las Vegas, NV 89139",
      loan_number: "20414784"
    }
  },
  {
    id: 2,
    rawText: `LOAN #: 20814794

TYPE OF TAX                  LAST AMOUNT PAID
CURRENT TAXES PAID THRU DATE
NEXT AMOUNT DUE

SETTLEMENT AGENT
ICE Mortgage Technology, Inc.                          Page 2 of 2`,
    predictedLabel: DocumentLabel.TAX_RECORD,
    confidence: 0.96,
    extractedFields: {
      borrower_name: null,
      property_address: null,
      loan_number: "20814794"
    }
  },
  {
    id: 3,
    rawText: `SIGNATURE/NAME AFFIDAVIT

RE: LOAN NUMBER
20414784

PROPERTY ADDRESS
604 N Crestview Hill Dr Unit 1144, Las Vegas, NV 89139

BEFORE ME, the undersigned authority, a Notary Public in and for said County and State, on this day
personally appeared,
Renard-Van Mercer, Alya`,
    predictedLabel: DocumentLabel.AFFIDAVIT,
    confidence: 0.95,
    extractedFields: {
      borrower_name: "Renard-Van Mercer, Alya",
      property_address: "604 N Crestview Hill Dr Unit 1144, Las Vegas, NV 89139",
      loan_number: "20414784"
    }
  },
  {
    id: 4,
    rawText: `LOAN #: 20414784
CONDOMINIUM RIDER

THIS CONDOMINIUM RIDER is made this 26th day of March, 2024
and is incorporated into and amends and supplements the Mortgage...

The Property includes a unit in... located at:
604 N Crestview Hill Dr Unit 1144, Las Vegas, NV 89139

The Property includes a unit in, together with an undivided interest...`,
    predictedLabel: DocumentLabel.RIDER,
    confidence: 0.99,
    extractedFields: {
      borrower_name: null,
      property_address: "604 N Crestview Hill Dr Unit 1144, Las Vegas, NV 89139",
      loan_number: "20414784"
    }
  },
  {
    id: 5,
    rawText: `LOAN #: 20414784

B. Property Insurance. So long as the Owners Association maintains...
   with a generally accepted insurance carrier...

C. Public Liability Insurance. Borrower will take such actions...

D. Condemnation. The proceeds of any award or claim...`,
    predictedLabel: DocumentLabel.RIDER,
    confidence: 0.92,
    extractedFields: {
      borrower_name: null,
      property_address: null,
      loan_number: "20414784"
    }
  },
  {
    id: 6,
    rawText: `LOAN #: 20414784

F. Remedies. If Borrower does not pay condominium dues...

BY SIGNING BELOW, Borrower accepts and agrees to the terms...

Alya Renard-Van Mercer                               (Seal)`,
    predictedLabel: DocumentLabel.RIDER,
    confidence: 0.98,
    extractedFields: {
      borrower_name: "Alya Renard-Van Mercer",
      property_address: null,
      loan_number: "20414784"
    }
  },
  {
    id: 7,
    rawText: `NOTE
March 26, 2024                                         Las Vegas, NV
[Note Date]                                            [City] [State]

604 N Crestview Hill Dr Unit 1144, Las Vegas, NV 89139
[Property Address]

1. BORROWER'S PROMISE TO PAY
LOAN #: 20414784

In return for a loan in the amount of U.S. $392,000.00...
I have received from Mariton Lending Group, LLC`,
    predictedLabel: DocumentLabel.RATE_NOTE,
    confidence: 0.99,
    extractedFields: {
      borrower_name: null, 
      property_address: "604 N Crestview Hill Dr Unit 1144, Las Vegas, NV 89139",
      loan_number: "20414784"
    }
  },
  {
    id: 8,
    rawText: `LOAN #: 20414784

5. LOAN CHARGES
   If applicable law sets maximum loan charges...

6. BORROWER'S FAILURE TO PAY AS REQUIRED
   (A) Late Charges for Overdue Payments
   The amount of the charge will be 5.000 % of my overdue...`,
    predictedLabel: DocumentLabel.RATE_NOTE,
    confidence: 0.94,
    extractedFields: {
      borrower_name: null,
      property_address: null,
      loan_number: "20414784"
    }
  },
  {
    id: 9,
    rawText: `LOAN #: 20414784

PAY TO THE ORDER OF:
WITHOUT RECOURSE
Mariton Lending Group, LLC, a Florida Limited Liability Company

BY: ______________________
TITLE: __________________`,
    predictedLabel: DocumentLabel.RATE_NOTE,
    confidence: 0.90,
    extractedFields: {
      borrower_name: null,
      property_address: null,
      loan_number: "20414784"
    }
  },
  {
    id: 10,
    rawText: `LOAN #: 20414784

10. UNIFORM SECURED NOTE
    This Note is a uniform instrument with limited variations...

WITNESS THE HAND(S) AND SEAL(S) OF THE UNDERSIGNED.

Alya Renard-Van Mercer                               (Seal)`,
    predictedLabel: DocumentLabel.RATE_NOTE,
    confidence: 0.97,
    extractedFields: {
      borrower_name: "Alya Renard-Van Mercer",
      property_address: null,
      loan_number: "20414784"
    }
  },
  {
    id: 11,
    rawText: `Closing Disclosure

Closing Information                 Transaction Information
Date Issued   03/28/2024            Borrower    Alya Renard-Van Mercer
Closing Date  03/28/2024                        4124 Silvercrest Avenue,
                                                Las Vegas, NV 89129

File #        145002-011511
Property      604 N Crestview Hill Dr Unit 1144, Las Vegas, NV 89139

Sale Price    $490,000`,
    predictedLabel: DocumentLabel.CLOSING_DISCLOSURE,
    confidence: 0.99,
    extractedFields: {
      borrower_name: "Alya Renard-Van Mercer",
      property_address: "604 N Crestview Hill Dr Unit 1144, Las Vegas, NV 89139",
      loan_number: null
    }
  },
  {
    id: 12,
    rawText: `Closing Cost Details

Loan Costs
A. Origination Charges
01 % of Loan Amount (Points) to Mariton Lending Group, LLC
02 Processing Fees to Mariton Lending Group, LLC`,
    predictedLabel: DocumentLabel.CLOSING_DISCLOSURE,
    confidence: 0.91,
    extractedFields: {
      borrower_name: null,
      property_address: null,
      loan_number: null
    }
  }
];

export const CANDIDATE_LABELS = [
  "Mortgage - Closing Disclosure - Seller",
  "Lender - Rate Note",
  "Title - Rider",
  "Property - Tax Record Information Sheet",
  "Title - Signature / Name Affidavit (Ack)"
];

export const EXTRACTION_SCHEMA = {
  "borrower_name": "string",
  "property_address": "string",
  "loan_number": "string"
};
