package demo

// UserProfile demonstrates tag sorting and alignment.
type UserProfile struct {
  ID        int64  `  db:"id"    json:"id"    yaml:"id"       validate:"required"`
		FirstName  string        `yaml:"first_name" json:"first_name" db:"first_name"      validate:"required,min=1,max=100"`
	LastName    string   `   yaml:"last_name" json:"last_name" db:"last_name"     validate:"required,min=1,max=100"   `
	Email       string `yaml:"email" json:"email" db:"email" validate:"required,email"`
	Age          int    `yaml:"age" json:"age" db:"age" validate:"min=0,max=150"`
	Bio           string `json:"bio,omitempty" yaml:"bio" db:"bio"`
}

// Address demonstrates alignment across consecutive fields.
type Address struct {
	Street  string `json:"street" yaml:"street" db:"street"`
	City    string `json:"city" yaml:"city" db:"city"`
	Country string `json:"country" yaml:"country" db:"country"`
	ZipCode string `json:"zip_code" yaml:"zip_code" db:"zip_code"`
}

// OrderItem demonstrates mixed tag keys and options.
type OrderItem struct {
	ProductID   int64   `json:"product_id" db:"product_id" validate:"required"`
	ProductName string  `json:"product_name" db:"product_name"`
	Quantity    int     `json:"quantity" db:"quantity" validate:"required,min=1"`
	Price       float64 `json:"price" db:"price" validate:"required,min=0"`
	Discount    float64 `json:"discount,omitempty" db:"discount"`
}

// Config demonstrates fields separated by blank lines (no alignment expected).
type Config struct {
	// Server settings
	Host string `json:"host" yaml:"host" env:"HOST"`
	Port int    `json:"port" yaml:"port" env:"PORT"`

	// Database settings
	DSN         string `json:"dsn" yaml:"dsn" env:"DSN"`
	MaxPoolSize int    `json:"max_pool_size" yaml:"max_pool_size" env:"MAX_POOL_SIZE"`

	// Feature flags
	Debug   bool `json:"debug" yaml:"debug" env:"DEBUG"`
	Verbose bool `json:"verbose" yaml:"verbose" env:"VERBOSE"`
}

// GormModel demonstrates tags that need normalization (extra spaces).
type GormModel struct {
	ID        uint   `gorm:"primarykey"   json:"id"`
	Name      string `gorm:"not null"     json:"name"      validate:"required"`
	CreatedAt string `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt string `gorm:"autoUpdateTime" json:"updated_at"`
}

// ServerOptions demonstrates smart sort and alignment with mixed CLI flag tags.
// Rare tags (default, choices, secret, required) are appended without gaps.
type ServerOptions struct {
	ListenAddr string `env:"LISTEN_ADDR"   description:"address to listen on"              long:"listen-addr"  short:"l"  default:"0.0.0.0:8080"`
	TLSCert    string `description:"path to TLS certificate file"   long:"tls-cert"   env:"TLS_CERT"   required:"false"`
	TLSKey     string `   env:"TLS_KEY"   long:"tls-key"   description:"path to TLS private key file"   required:"false"   `
	AuthToken  string `long:"auth-token" description:"bearer token for API authentication" env:"AUTH_TOKEN" secret:"true"`
	LogLevel   string `  default:"info"   description:"logging verbosity level"   env:"LOG_LEVEL"   long:"log-level"  choices:"debug;info;warn;error"  `
	Timeout    int    `description:"request timeout in seconds"  env:"TIMEOUT"  long:"timeout"  default:"30"  validate-min:"1"`
	Workers    int    `env:"WORKERS"  description:"number of worker goroutines"  long:"workers"  default:"4"  validate-min:"1"`
	MaxConns   int    `description:"maximum concurrent connections"  default:"100"  long:"max-conns"  env:"MAX_CONNS"  validate-min:"1"`
	BaseURL    string `long:"base-url"  env:"BASE_URL"  description:"public base URL of the service"`
	Debug      bool   `short:"d" env:"DEBUG" long:"debug" description:"enable debug output"`
}

// Nested demonstrates a struct with an embedded type (should be skipped for alignment).
type Nested struct {
	Address
	ExtraField  string `json:"extra" yaml:"extra"`
	UserProfile struct {
		ID        int64  `db:"id" json:"id" yaml:"id" validate:"required"`
		FirstName string `yaml:"first_name" json:"first_name" db:"first_name" validate:"required,min=1,max=100"`
		LastName  string `yaml:"last_name" json:"last_name" db:"last_name" validate:"required,min=1,max=100"`
	}
}
