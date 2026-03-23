from sqlalchemy import Column, String, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base

class Customer(Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, index=True) # soldToParty
    
    billing_documents = relationship("BillingDocument", back_populates="customer")

class Company(Base):
    __tablename__ = "companies"
    id = Column(String, primary_key=True, index=True) # companyCode
    
    billing_documents = relationship("BillingDocument", back_populates="company")

class AccountingDocument(Base):
    __tablename__ = "accounting_documents"
    id = Column(String, primary_key=True, index=True) # accountingDocument
    
    billing_documents = relationship("BillingDocument", back_populates="accounting_document")

class BillingDocument(Base):
    __tablename__ = "billing_documents"
    
    id = Column(String, primary_key=True, index=True) # billingDocument
    type = Column(String) # billingDocumentType
    creation_date = Column(DateTime)
    last_change_datetime = Column(DateTime)
    total_net_amount = Column(Float)
    currency = Column(String) # transactionCurrency
    is_cancelled = Column(Boolean)
    
    customer_id = Column(String, ForeignKey("customers.id"))
    company_id = Column(String, ForeignKey("companies.id"))
    accounting_document_id = Column(String, ForeignKey("accounting_documents.id"))

    customer = relationship("Customer", back_populates="billing_documents")
    company = relationship("Company", back_populates="billing_documents")
    accounting_document = relationship("AccountingDocument", back_populates="billing_documents")
