CREATE TABLE clients (
	id INTEGER NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_clients_id ON clients (id);
CREATE UNIQUE INDEX ix_clients_name ON clients (name);
CREATE TABLE recruiters (
	id INTEGER NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ix_recruiters_name ON recruiters (name);
CREATE INDEX ix_recruiters_id ON recruiters (id);
CREATE TABLE candidates (
	id INTEGER NOT NULL, 
	full_name VARCHAR(180) NOT NULL, 
	phone VARCHAR(60), 
	email VARCHAR(180), 
	notes TEXT, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_candidates_id ON candidates (id);
CREATE INDEX ix_candidates_full_name ON candidates (full_name);
CREATE TABLE vacancies (
	id INTEGER NOT NULL, 
	client_id INTEGER NOT NULL, 
	title VARCHAR(180) NOT NULL, 
	fee_amount FLOAT NOT NULL, city VARCHAR(120), 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id)
);
CREATE INDEX ix_vacancies_id ON vacancies (id);
CREATE INDEX ix_vacancies_title ON vacancies (title);
CREATE INDEX ix_vacancies_client_id ON vacancies (client_id);
CREATE TABLE applications (
	id INTEGER NOT NULL, 
	candidate_id INTEGER NOT NULL, 
	vacancy_id INTEGER NOT NULL, 
	recruiter_id INTEGER NOT NULL, 
	date_contacted DATE NOT NULL, 
	status VARCHAR(40) NOT NULL, 
	rejection_date DATE, 
	start_date DATE, 
	paid BOOLEAN NOT NULL, 
	paid_date DATE, 
	payment_amount FLOAT NOT NULL, 
	is_replacement BOOLEAN NOT NULL, 
	replacement_of_id INTEGER, 
	replacement_note TEXT, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(candidate_id) REFERENCES candidates (id), 
	FOREIGN KEY(vacancy_id) REFERENCES vacancies (id), 
	FOREIGN KEY(recruiter_id) REFERENCES recruiters (id), 
	FOREIGN KEY(replacement_of_id) REFERENCES applications (id)
);
CREATE INDEX ix_applications_candidate_id ON applications (candidate_id);
CREATE INDEX ix_applications_paid_date ON applications (paid_date);
CREATE INDEX ix_applications_is_replacement ON applications (is_replacement);
CREATE INDEX ix_applications_vacancy_id ON applications (vacancy_id);
CREATE INDEX ix_applications_recruiter_id ON applications (recruiter_id);
CREATE INDEX ix_applications_status ON applications (status);
CREATE INDEX ix_applications_id ON applications (id);
CREATE INDEX ix_applications_date_contacted ON applications (date_contacted);
CREATE INDEX ix_applications_paid ON applications (paid);
CREATE TABLE payments (
	id INTEGER NOT NULL, 
	application_id INTEGER NOT NULL, 
	paid_date DATE NOT NULL, 
	amount FLOAT NOT NULL, 
	note TEXT, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(application_id) REFERENCES applications (id)
);
CREATE INDEX ix_payments_paid_date ON payments (paid_date);
CREATE INDEX ix_payments_application_id ON payments (application_id);
CREATE INDEX ix_payments_id ON payments (id);
CREATE TABLE users (
	id INTEGER NOT NULL, 
	username VARCHAR(120) NOT NULL, 
	password_hash VARCHAR(128) NOT NULL, 
	password_salt VARCHAR(64) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	recruiter_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(recruiter_id) REFERENCES recruiters (id)
);
CREATE INDEX ix_users_id ON users (id);
CREATE UNIQUE INDEX ix_users_username ON users (username);
CREATE INDEX ix_users_role ON users (role);
CREATE INDEX ix_users_recruiter_id ON users (recruiter_id);
