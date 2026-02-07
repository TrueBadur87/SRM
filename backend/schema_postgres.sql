-- PostgreSQL compatible schema

CREATE TABLE clients (
	id SERIAL PRIMARY KEY,
	name VARCHAR(120) NOT NULL UNIQUE
);
CREATE INDEX ix_clients_name ON clients (name);

CREATE TABLE recruiters (
	id SERIAL PRIMARY KEY,
	name VARCHAR(120) NOT NULL UNIQUE
);
CREATE INDEX ix_recruiters_name ON recruiters (name);

CREATE TABLE candidates (
	id SERIAL PRIMARY KEY,
	full_name VARCHAR(180) NOT NULL,
	phone VARCHAR(60),
	email VARCHAR(180),
	notes TEXT
);
CREATE INDEX ix_candidates_full_name ON candidates (full_name);

CREATE TABLE vacancies (
	id SERIAL PRIMARY KEY,
	client_id INTEGER NOT NULL REFERENCES clients (id),
	title VARCHAR(180) NOT NULL,
	fee_amount DOUBLE PRECISION NOT NULL,
	city VARCHAR(120)
);
CREATE INDEX ix_vacancies_title ON vacancies (title);
CREATE INDEX ix_vacancies_client_id ON vacancies (client_id);

CREATE TABLE applications (
	id SERIAL PRIMARY KEY,
	candidate_id INTEGER NOT NULL REFERENCES candidates (id),
	vacancy_id INTEGER NOT NULL REFERENCES vacancies (id),
	recruiter_id INTEGER NOT NULL REFERENCES recruiters (id),
	date_contacted DATE NOT NULL,
	status VARCHAR(40) NOT NULL,
	rejection_date DATE,
	start_date DATE,
	paid BOOLEAN NOT NULL DEFAULT FALSE,
	paid_date DATE,
	payment_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
	is_replacement BOOLEAN NOT NULL DEFAULT FALSE,
	replacement_of_id INTEGER REFERENCES applications (id),
	replacement_note TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_applications_candidate_id ON applications (candidate_id);
CREATE INDEX ix_applications_paid_date ON applications (paid_date);
CREATE INDEX ix_applications_is_replacement ON applications (is_replacement);
CREATE INDEX ix_applications_vacancy_id ON applications (vacancy_id);
CREATE INDEX ix_applications_recruiter_id ON applications (recruiter_id);
CREATE INDEX ix_applications_status ON applications (status);
CREATE INDEX ix_applications_date_contacted ON applications (date_contacted);
CREATE INDEX ix_applications_paid ON applications (paid);

CREATE TABLE payments (
	id SERIAL PRIMARY KEY,
	application_id INTEGER NOT NULL REFERENCES applications (id),
	paid_date DATE NOT NULL,
	amount DOUBLE PRECISION NOT NULL,
	note TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_payments_paid_date ON payments (paid_date);
CREATE INDEX ix_payments_application_id ON payments (application_id);

CREATE TABLE users (
	id SERIAL PRIMARY KEY,
	username VARCHAR(120) NOT NULL UNIQUE,
	password_hash VARCHAR(128) NOT NULL,
	password_salt VARCHAR(64) NOT NULL,
	role VARCHAR(20) NOT NULL,
	recruiter_id INTEGER REFERENCES recruiters (id)
);
CREATE INDEX ix_users_role ON users (role);
CREATE INDEX ix_users_recruiter_id ON users (recruiter_id);
